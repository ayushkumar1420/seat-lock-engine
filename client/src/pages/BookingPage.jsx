import { useState, useEffect } from "react";
import SeatMap from "../components/SeatMap";
import API_URL from "../services/api";
import App from "../App";

function BookingPage({ token, user, onLogout }) {
    const [showtimes, setShowtimes] = useState([]);
    const [selectedShowtime, setSelectedShowtime] = useState("");
    const [seats, setSeats] = useState([]);
    const [ticketPrice, setTicketPrice] = useState(0);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchShowtime = async () => {
            try {
                const response = await fetch(`${API_URL}/api/showtimes`);
                if (!response.ok) throw new Error("failed to fetch showtimes");

                const data = await response.json();
                setShowtimes(data);
                if(data.length) setSelectedShowtime(data[0]._id);
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
        setSeats(data.seats || []);
        setTicketPrice(data.ticketPrice || 0);
    };

    useEffect(() => {
        if (!selectedShowtime) return;

        setSelectedSeats([]);
        fetchSeats(selectedShowtime).catch(console.error);
    }, [selectedShowtime]);

    const selectSeat = (seat) => {
        if (seat.status === "BOOKED") return;

        setSelectedSeats((previous) => 
        previous.includes(seat.seatNumber) ? 
        previous.filter((item) => item !== seat.seatNumber) : [...previous, seat.seatNumber])
    };

    const checkBookingStatus = async (bookingId, showtimeId) => {
        //webhook may takes few seconds to finish
        for ( let attempt = 0; attempt < 5; attempt++) {
            const response = await fetch(`${API_URL}/api/bookings/${bookingId}/status`);
            if (!response.ok) {
                throw new Error("failed to check booking status");
            }

            const data = await response.json();
            
            if (data.status === "SUCCESS"){
                setSelectedSeats([]);
                await fetchSeats(showtimeId);
                alert("booking confirmed");
                return;
            }

            if (data.status === "FAILED" || data.status === "EXPIRED") {
                alert(`booking status: ${data.status}`);
                return;
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        alert("payment received, booking confirmation is still pending, please wait");
    };

    const verifyPayment = async (PaymentResponse, bookingId, showtimeId) => {
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
                throw new Error(data.message || "payment verification faield");
            }
            await checkBookingStatus(bookingId, showtimeId);
        } catch (error) {
            console.error(error)
                alert(error.message);
            } finally {
                setLoading(false);
            }
        };

        const handleBooking = async () => {
            if (!selectedShowtime || !selectedSeats.length || loading) return;
            setLoading(true);

            try {
                const headers = {
                    "content-type": "application/json",
                    Authorization: `Bearer ${token}`,
                };

                const lockResponse = await fetch(`${API_URL}/api/bookings/lock`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ showtimes: selectedShowtime, seats: selectedSeats }),
                });

                const booking = await lockResponse.json();
                if (!lockResponse.ok) {
                    throw new Error(booking.message || "Seat locking failed");
                }

                const paymentResponse = await fetch(`${API_URL}/api/payments/create-order`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ bookingId: booking.bookingId }),
                });

                const payment = await paymentResponse.json();
                if (!paymentResponse.ok) {
                    throw new Error(payment.meesage || "payment order failed");
                }
                if (!window.Razorpay) {
                    throw new Error("razorpay failed to laod");
                }

                const razorpay = new window.Razorpay({
                    key: payment.keyId,
                    amount: payment.amount,
                    currency: payment.currency,
                    order_id: payment.orderId,
                    name: "Seat Lock Engine",
                    handler: (response) => verifyPayment(response, booking.bookingId, selectedShowtime),
                    model: { ondismiss: () => setLoading(false) },
                });

                razorpay.on("payment.fialed", () => {
                    setLoading(false);
                    alert("payment failed, please try again after the seat lock expires");
                });

                razorpay.open();
            } catch (error) {
                console.error(error);
                alert(error.message);
                setLoading(false);
            };
        };

        const totalAmount = selectedSeats.length * ticketPrice;

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
                   onChange={(e) => setSelectedShowtime(e.target.value)}>
                    {showtimes.map((showtime) => (
                        <option key={showtime._id} value={showtime._id}>
                            {new Date(showtime.startTime).toLocaleString()} - ₹{showtime.ticketPrice}
                        </option>
                    ))}
                   </select>

                   <p>₹{ticketPrice} per seat</p>

                   <SeatMap seats={seats} selectedSeats={selectedSeats} onSelect={selectSeat}></SeatMap>

                   <p>Selected: {selectedSeats.length ? selectedSeats.join(", ") : "None"}</p>
                   <h3>Total: ₹{totalAmount}</h3>

                   <button
                        className="book-button"
                        onClick={handleBooking}
                        disabled={loading || !selectedSeats.length}>
                            {loading ? "processing..." : "book seats"}
                    </button>
            </div>
        );
}

export default BookingPage;