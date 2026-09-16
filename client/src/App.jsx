import { useEffect, useState } from "react";
import "./App.css";

const SHOWTIME_ID = "6a91259edcce5321a923104d";

function App() {
  const [seats, setSeats] = useState([]);
  const [ticketPrice, setTicketPrice] = useState(0);
  const [selectedSeats, setSelectedSeats] = useState([]);

  const fetchSeats = async () => {
  try {
    const response = await fetch(
      `http://localhost:5000/api/showtimes/${SHOWTIME_ID}/seats`
    );

    const data = await response.json();

    setSeats(data.seats || []);
    setTicketPrice(data.ticketPrice || 0);
  } catch (error) {
    console.log("Error fetching seats:", error);
  }
};

  useEffect(() => {
    fetchSeats();
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

    const options = {
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency,
      order_id: payment.orderId,
      name: "seat lock engine",

      handler: async function (response) {
        const verifyResponse = await fetch(
          "http://localhost:5000/api/payments/verify",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              userId: "test-user",
            }),
          }
        );

        const verifyData = await verifyResponse.json();
        if(!verifyResponse.ok){
          alert(verifyData.message);
          return;

          //give webhook time to finalize booking
          setTimeout(async () => {
            const statusResponse = await fetch(
              `http://localhost:5000/api/bookings/${booking.bookingId}/status`
            );

            const statusData = await statusResponse.json();
            if(statusData.status === "SUCCESS"){
              setSelectedSeats([]);

              //refresh seats from database
              await fetchSeats();
              alert("Booking confirmed");
            } else {
              alert(`Booking status: ${statusData.status}`);
            }
          }, 2000);
        }
      }
  };

  const razorpay = new window.Razorpay(options);
  razorpay.open();
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