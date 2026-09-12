import { useEffect, useState } from "react";
import "./App.css";

const SHOWTIME_ID = "6a91259edcce5321a923104d";

function App() {
  const [seats, setSeats] = useState([]);
  const [ticketPrice, setTicketPrice] = useState(0);
  const [selectedSeats, setSelectedSeats] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:5000/api/showtimes/${SHOWTIME_ID}/seats`)
      .then((res) => res.json())
      .then((data) => {
        setSeats(data.seats || []);
        setTicketPrice(data.ticketPrice || 0);
      })
      .catch((error) => {
        console.log("Error fetching seats:", error);
      });
  }, []);

  const selectSeat = (seat) => {
    if (seat.status === "BOOKED") return;

    if (selectedSeats.includes(seat.seatNumber)) {
      setSelectedSeats(
        selectedSeats.filter((item) => item !== seat.seatNumber)
      );
    } else {
      setSelectedSeats([...selectedSeats, seat.seatNumber]);
    }
  };

  const totalAmount = selectedSeats.length * ticketPrice;

  const handleBooking = async () => {
    if (selectedSeats.length === 0) {
      alert("Select at least one seat");
      return;
    }

    // lock seats
    const lockResponse = await fetch(
      "http://localhost:5000/api/bookings/lock",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          showtimeId: SHOWTIME_ID,
          userId: "test-user",
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

    // create Razorpay order
    const paymentResponse = await fetch(
      "http://localhost:5000/api/payments/create-order",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: booking.bookingId,
          userId: "test-user",
        }),
      }
    );

    const payment = await paymentResponse.json();

    if (!paymentResponse.ok) {
      alert(payment.message);
      return;
    }

    console.log("Payment order:", payment);
  };

  return (
    <div className="app">
      <h1>Select Seats</h1>

      <p>₹{ticketPrice} per seat</p>

      <div className="seat-map">
        {seats.map((seat) => (
          <button
            key={seat._id}
            disabled={seat.status === "BOOKED"}
            className={
              selectedSeats.includes(seat.seatNumber)
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