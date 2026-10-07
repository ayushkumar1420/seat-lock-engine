import { useState, useEffect, useRef } from "react";
import SeatMap from "../components/SeatMap";
import API_URL from "../services/api";

function BookingPage({ token, user, onLogout }) {
    const storageKey = user?.id ? `pendingBookings:${user.id}` : null;
    const [pendingBookings, setPendingBookings] = useState(() => {
        if (!storageKey) return [];
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
            return Array.isArray(saved) ? saved.filter((booking) =>
                /^[a-f\d]{24}$/i.test(booking?.bookingId) &&
                /^[a-f\d]{24}$/i.test(booking?.showtimeId)
            ) : [];
        } catch (error) {
            console.error("could not restore pending bookings", error);
            return [];
        }
    });

    const getActiveBooking = (bookings) => [...bookings]
    .reverse()
    .find((booking) => booking.status === "PENDING" &&
        new Date(booking.expiresAt).getTime() > Date.now());

    const activeStoredBooking = getActiveBooking(pendingBookings);
    const [recoveryBookingId, setRecoveryBookingId] = useState(activeStoredBooking?.bookingId || null);
    const [paymentMessage, setPaymentMessage] = useState(() => pendingBookings.length ? "Restoring booking status..." : "");
    const [showtimes, setShowtimes] = useState([]);
    const [selectedShowtime, setSelectedShowtime] = useState(activeStoredBooking?.showtimeId || "");
    const [seats, setSeats] = useState([]);
    const [ticketPrice, setTicketPrice] = useState(0);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lockExpiresAt, setLockExpiresAt] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const lockedSeatsRef = useRef([]);
    const lockedBookingRef = useRef(null);
    const razorpayRef = useRef(null);
    const pendingBookingIds = pendingBookings.map((booking) => booking.bookingId).join(",");

    useEffect(() => {
        if (!storageKey) return;
        try {
            if (pendingBookings.length) {
                localStorage.setItem(storageKey, JSON.stringify(pendingBookings));
            } else {
                localStorage.removeItem(storageKey);
            }
        } catch (error) {
            console.error("could not save pending bookings", error);
        }
    }, [pendingBookings, storageKey]);

    useEffect(() => {
        const fetchShowtime = async () => {
            try {
                const response = await fetch(`${API_URL}/api/showtimes`);
                if (!response.ok) throw new Error("failed to fetch showtimes");

                const data = await response.json();
                setShowtimes(data);
                if(data.length) setSelectedShowtime((previous) => previous || data[0]._id);
            } catch (error) {
                console.error(error);
            }
        };
        fetchShowtime();
    }, []);

    const fetchSeats = async (showtimeId) => {
        const response = await fetch(`${API_URL}/api/showtimes/${showtimeId}/seats`);
        if (!response.ok) throw new Error("failed to fetch seats");

        const data = await response.json();
        const latestSeats = data.seats || [];

        setSeats(latestSeats);
        setTicketPrice(data.ticketPrice || 0);

        //remove selected seats that are no longer available
        setSelectedSeats((previous) => previous.filter((seatNumber) => {
            const seat = latestSeats.find((item) => item.seatNumber === seatNumber);
            return seat && seat.status === "AVAILABLE" || lockedSeatsRef.current.includes(seatNumber);
        }));
    };

    useEffect(() => {
        if (!selectedShowtime) return;

        const initialFetch = setTimeout(() => {
            fetchSeats(selectedShowtime).catch(console.error);
        }, 0);

        const interval = setInterval(() => {
            fetchSeats(selectedShowtime).catch(console.error);
        }, 3000);

        return () => {
            clearTimeout(initialFetch);
            clearInterval(interval);
        };
    }, [selectedShowtime]);

    useEffect(() => {
        if(!lockExpiresAt) return;

        const updateTimer = () => {
            const remaining = Math.max(0, Math.floor((new Date(lockExpiresAt).getTime() - Date.now()) / 1000));
            setTimeLeft(remaining);

            if(remaining === 0){
                if (razorpayRef.current) {
    try {
        razorpayRef.current.close();
    } catch {
        console.log("could not close razorpay automatically");
    }

    razorpayRef.current = null;
}

// Fallback if Razorpay checkout is still open
const closeButton = document.querySelector(".razorpay-container .razorpay-close");

if (closeButton) {
    closeButton.click();
}

                lockedSeatsRef.current = [];
                lockedBookingRef.current = null;
                setLockExpiresAt(null);
                setLoading(false);

                if(selectedShowtime){
                    fetchSeats(selectedShowtime).catch(console.error);
                }
            }
        };
        
        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [lockExpiresAt, selectedShowtime]);

    const selectSeat = (seat) => {
        if (loading || recoveryBookingId || lockExpiresAt) return;
        if (seat.status === "BOOKED" || seat.status === "LOCKED") return;

        setSelectedSeats((previous) => 
        previous.includes(seat.seatNumber) ? 
        previous.filter((item) => item !== seat.seatNumber) : [...previous, seat.seatNumber])
    };

    useEffect(() => {
        if (!pendingBookingIds) return;

        let cancelled = false;
        let timer;
        const controller = new AbortController();
        const poll = async () => {
            const updates = await Promise.all(pendingBookingIds.split(",").map(async (bookingId) => {
                try {
                    const response = await fetch(`${API_URL}/api/bookings/${bookingId}/status`, {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    });
                    if (!response.ok) throw new Error("booking status temporarily unavailable");
                    return { bookingId, data: await response.json() };
                } catch (error) {
                    return { bookingId, error };
                }
            }));
            if (cancelled) return;
            if (updates.some((update) => update.bookingId === recoveryBookingId && update.data)) {
                setRecoveryBookingId(null);
            }

            const finished = new Set();
            const messages = [];
            const confirmations = [];
            let activeBooking;
            for (const { bookingId, data, error } of updates) {
                const label = `Booking ${bookingId}: `;
                if (error) {
                    messages.push(`${label}status unavailable. We will keep checking; payment outcome is not yet confirmed.`);
                    continue;
                }

                let finalMessage;
                if (data.status === "SUCCESS") {
                    finalMessage = "booking confirmed.";
                } else if (data.paymentStatus === "REFUND_REQUIRED") {
                    finalMessage = "money was captured, but the booking could not be fulfilled. Refund/reconciliation is required; a refund is not yet confirmed.";
                } else if (data.paymentStatus === "REFUNDED") {
                    finalMessage = "payment refunded.";
                } else if (data.paymentStatus === "FAILED") {
                    finalMessage = "payment attempt was marked failed by the server.";
                }

                if (finalMessage) {
                    finished.add(bookingId);
                    confirmations.push(label + finalMessage);
                } else {
                    messages.push(label + (data.status === "EXPIRED" || new Date(data.expiresAt).getTime() <= Date.now()
                        ? "seat reservation expired. Payment outcome is still being checked; expiry does not confirm payment failure."
                        : "payment/booking confirmation pending."));
                    if (bookingId === recoveryBookingId && data.status === "PENDING" && new Date(data.expiresAt).getTime() > Date.now()) {
                        activeBooking = data;
                    }
                }
            }

            setPendingBookings((previous) => previous.filter((booking) => !finished.has(booking.bookingId)).map((booking) => {
                const data = updates.find((update) => update.bookingId === booking.bookingId)?.data;
                return data ? { bookingId: data.bookingId, showtimeId: data.showtimeId, seats: data.seats, expiresAt: data.expiresAt, status: data.status } : booking;
            }));
            setPaymentMessage([...confirmations, ...messages].join(" "));
            if (activeBooking) {
                lockedSeatsRef.current = activeBooking.seats;
                lockedBookingRef.current = activeBooking.bookingId;
                setSelectedShowtime(activeBooking.showtimeId);
                setSelectedSeats(activeBooking.seats);
                setLockExpiresAt(activeBooking.expiresAt);
            } else if (finished.has(lockedBookingRef.current)) {
                lockedSeatsRef.current = [];
                lockedBookingRef.current = null;
                setLockExpiresAt(null);
                setTimeLeft(0);
                setSelectedSeats([]);
                setLoading(false);
            }
            if (confirmations.length) alert(confirmations.join("\n\n"));
            timer = setTimeout(poll, 5000);
        };

        poll();
        return () => {
            cancelled = true;
            controller.abort();
            clearTimeout(timer);
        };
    }, [pendingBookingIds, token, recoveryBookingId]);

        const verifyPayment = async (paymentResponse, checkout) => {
        try {
            const response = await fetch(`${API_URL}/api/payments/verify`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_signature: paymentResponse.razorpay_signature,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || "payment verification unavailable");
            }
        } catch (error) {
                // A failed browser verification request cannot establish the payment outcome.
                // Persisted bookings continue polling the authoritative webhook result.
                console.error(error);
            } finally {
                if (razorpayRef.current === checkout) {
                    razorpayRef.current = null;
                    setLoading(false);
                }
            }
        };

        const handleBooking = async () => {
            if (!storageKey || !selectedShowtime || !selectedSeats.length || loading || recoveryBookingId) return;
            setLoading(true);
            let booking;

            try {
                booking = pendingBookings.find((item) => item.showtimeId === selectedShowtime &&
                    item.status === "PENDING" && new Date(item.expiresAt).getTime() > Date.now());
                if (!booking) {
                const lockResponse = await fetch(`${API_URL}/api/bookings/lock`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ 
                        showtimeId: selectedShowtime, 
                        seats: selectedSeats 
                    }),
                });

                const lockedBooking = await lockResponse.json();

                if (!lockResponse.ok) {
                    throw new Error(lockedBooking.message || "Seat locking failed");
                }
                booking = { ...lockedBooking, showtimeId: selectedShowtime, status: "PENDING" };
                setPendingBookings((previous) => [...previous, booking]);
                }

                lockedSeatsRef.current = booking.seats;
                lockedBookingRef.current = booking.bookingId;
                setLockExpiresAt(booking.expiresAt)
                // Persist before requesting/opening checkout so an immediate reload can recover it.
                try {
                    const savedBookings = pendingBookings.some((item) => item.bookingId === booking.bookingId)
                        ? pendingBookings : [...pendingBookings, booking];
                    localStorage.setItem(storageKey, JSON.stringify(savedBookings));
                } catch {
                    throw new Error("Could not save booking recovery in this browser. Payment checkout was not opened. Enable browser storage and retry.");
                }

                const paymentResponse = await fetch(`${API_URL}/api/payments/create-order`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ bookingId: booking.bookingId }),
                });

                const payment = await paymentResponse.json();

                if (!paymentResponse.ok) {
                    throw new Error(payment.message || "Payment order failed");
                }
                if (lockedBookingRef.current !== booking.bookingId || new Date(booking.expiresAt).getTime() <= Date.now()) {
                    throw new Error("Seat reservation is no longer active. Booking status will continue to be checked.");
                }
                if (!window.Razorpay) {
                    throw new Error("Razorpay failed to laod");
                }

                const razorpay = new window.Razorpay({
                    key: payment.keyId,
                    amount: payment.amount,
                    currency: payment.currency,
                    order_id: payment.orderId,
                    name: "Seat Lock Engine",
                    handler: (response) => verifyPayment(response, razorpay),
                    modal: { ondismiss: () => {
                        if (razorpayRef.current === razorpay) {
                            razorpayRef.current = null;
                            setLoading(false);
                        }
                    } },
                });

                razorpay.on("payment.failed", () => {
                    if (razorpayRef.current !== razorpay) return;
                    setLoading(false);
                    alert("Checkout reported a failed attempt. Payment and booking status are still being checked.");
                });

                razorpayRef.current = razorpay;
                razorpay.open();
            } catch (error) {
                console.error(error);
                alert(error.message);
                if (!booking || lockedBookingRef.current === booking.bookingId) setLoading(false);
            };
        };

        const totalAmount = selectedSeats.length * ticketPrice;

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

        console.log("booking page", { seats, selectedSeats });

        return (
            <div className="app">
                <div className="user-info">
                    <p>Logged in as <strong>{user?.name}</strong></p>
                    <button onClick={onLogout}>Logout</button>
                </div>
                <h1>Select Seats</h1>

                <label htmlFor="showtime">Showtime:</label>
                <select 
                   id="showtime"
                   value={selectedShowtime}
                   disabled={loading || Boolean(recoveryBookingId) || Boolean(lockExpiresAt)}
                   onChange={(e) => {
                       setSelectedSeats([]);
                       setSelectedShowtime(e.target.value);
                   }}>
                    {selectedShowtime && !showtimes.some((showtime) => showtime._id === selectedShowtime) && (
                        <option value={selectedShowtime}>Pending booking showtime</option>
                    )}
                    {showtimes.map((showtime) => (
                        <option key={showtime._id} value={showtime._id}>
                            {new Date(showtime.startTime).toLocaleString()} - ₹{showtime.ticketPrice}
                        </option>
                    ))}
                   </select>

                   <p>₹{ticketPrice} per seat</p>

                   <SeatMap seats={seats} selectedSeats={selectedSeats} onSelect={selectSeat} />

                   <p>Selected: {selectedSeats.length ? selectedSeats.join(", ") : "None"}</p>
                   <h3>Total: ₹{totalAmount}</h3>

                   {paymentMessage && <p role="status">{paymentMessage}</p>}

                   {lockExpiresAt && timeLeft > 0 && (
                    <div className="lock-timer">
                        <p>your seats are temporarily reserved</p>
                        <strong>{formattedTime}</strong>
                        <p>complete payment before the time expires</p>
                    </div>
                   )}

                   <button
                        className="book-button"
                        onClick={handleBooking}
                        disabled={loading || Boolean(recoveryBookingId) || !selectedSeats.length}>
                            {loading ? "processing..." : lockExpiresAt ? "resume payment" : "book seats"}
                    </button>
            </div>
        );
}

export default BookingPage;
