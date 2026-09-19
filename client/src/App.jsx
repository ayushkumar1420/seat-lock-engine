import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;
const USER_ID = "test-user";

function App() {
  const [showtimes, setShowtimes] = useState([]);
  const [selectedShowtime, setSelectedShowtime] = useState("");
  const [seats, setSeats] = useState([]);
  const [ticketPrice, setTicketPrice] = useState(0);
  const [selectedSeats, setSelectedSeats] = useState([]);

  // Fetch showtimes
  useEffect(() => {
    const fetchShowtimes = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/showtimes`
        );

        const data = await response.json();

        setShowtimes(data);

        // Select first showtime by default
        if (data.length > 0) {
          setSelectedShowtime(data[0]._id);
        }
      } catch (error) {
        console.log("Error fetching showtimes:", error);
      }
    };

    fetchShowtimes();
  }, []);

  // Fetch seats
  const fetchSeats = async (showtimeId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/showtimes/${showtimeId}/seats`
      );

      const data = await response.json();

      setSeats(data.seats || []);
      setTicketPrice(data.ticketPrice || 0);
    } catch (error) {
      console.log("Error fetching seats:", error);
    }
  };

  // Fetch seats when showtime changes
  useEffect(() => {
    if (selectedShowtime) {
      fetchSeats(selectedShowtime);
      setSelectedSeats([]);
    }
  }, [selectedShowtime]);

  const selectSeat = (seat) => {
    if (seat.status === "BOOKED") return;

    if (selectedSeats.includes(seat.seatNumber)) {
      setSelectedSeats(
        selectedSeats.filter(
          (item) => item !== seat.seatNumber
        )
      );
    } else {
      setSelectedSeats([
        ...selectedSeats,
        seat.seatNumber,
      ]);
    }
  };

  const totalAmount =
    selectedSeats.length * ticketPrice;

  const handleBooking = async () => {
    if (!selectedShowtime) {
      alert("Select a showtime");
      return;
    }

    if (selectedSeats.length === 0) {
      alert("Select at least one seat");
      return;
    }

    try {
      // Lock seats
      const lockResponse = await fetch(
        `${API_URL}/api/bookings/lock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            showtimeId: selectedShowtime,
            userId: USER_ID,
            seats: selectedSeats,
            totalAmount,
          }),
        }
      );

      const booking = await lockResponse.json();

      if (!lockResponse.ok) {
        alert(booking.message);
        return;
      }

      console.log("Booking:", booking);

      // Create Razorpay order
      const paymentResponse = await fetch(
        `${API_URL}/api/payments/create-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            bookingId: booking.bookingId,
            userId: USER_ID,
          }),
        }
      );

      const payment =
        await paymentResponse.json();

      if (!paymentResponse.ok) {
        alert(payment.message);
        return;
      }

      console.log("Payment order:", payment);

      // Razorpay Checkout
      const options = {
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        order_id: payment.orderId,
        name: "Seat Lock Engine",

        handler: async function (response) {
          // Verify payment
          const verifyResponse = await fetch(
            `${API_URL}/api/payments/verify`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                razorpay_order_id:
                  response.razorpay_order_id,

                razorpay_payment_id:
                  response.razorpay_payment_id,

                razorpay_signature:
                  response.razorpay_signature,

                userId: USER_ID,
              }),
            }
          );

          const verifyData =
            await verifyResponse.json();

          if (!verifyResponse.ok) {
            alert(verifyData.message);
            return;
          }

          console.log(
            "Payment verified:",
            verifyData
          );

          // Give webhook time to finalize booking
          setTimeout(async () => {
            const statusResponse = await fetch(
              `${API_URL}/api/bookings/${booking.bookingId}/status`
            );

            const statusData =
              await statusResponse.json();

            console.log(
              "Booking status:",
              statusData
            );

            if (
              statusData.status === "SUCCESS"
            ) {
              setSelectedSeats([]);

              await fetchSeats(
                selectedShowtime
              );

              alert("Booking confirmed!");
            } else {
              alert(
                `Booking status: ${statusData.status}`
              );
            }
          }, 2000);
        },
      };

      const razorpay =
        new window.Razorpay(options);

      razorpay.open();
    } catch (error) {
      console.log("Booking error:", error);

      alert("Something went wrong");
    }
  };

  return (
    <div className="app">
      <h1>Select Seats</h1>

      <label>Showtime: </label>

      <select
        value={selectedShowtime}
        onChange={(e) =>
          setSelectedShowtime(e.target.value)
        }
      >
        {showtimes.map((showtime) => (
          <option
            key={showtime._id}
            value={showtime._id}
          >
            {new Date(
              showtime.startTime
            ).toLocaleString()}{" "}
            - ₹{showtime.ticketPrice}
          </option>
        ))}
      </select>

      <p>₹{ticketPrice} per seat</p>

      <div className="seat-map">
        {seats.map((seat) => (
          <button
            key={seat._id}
            disabled={
              seat.status === "BOOKED"
            }
            className={
              selectedSeats.includes(
                seat.seatNumber
              )
                ? "seat selected"
                : seat.status === "BOOKED"
                ? "seat booked"
                : "seat"
            }
            onClick={() => selectSeat(seat)}
          >
            {seat.seatNumber}
          </button>
        ))}
      </div>

      <p>
        Selected:{" "}
        {selectedSeats.length
          ? selectedSeats.join(", ")
          : "None"}
      </p>

      <h3>Total: ₹{totalAmount}</h3>

      <button
        className="book-button"
        onClick={handleBooking}
      >
        Book Seats
      </button>
    </div>
  );
}

export default App;