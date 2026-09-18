import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;
const SHOWTIME_ID = "6a91259edcce5321a923104d";
const USER_ID = "test-user";

function App() {
  const [seats, setSeats] = useState([]);
  const [ticketPrice, setTicketPrice] = useState(0);
  const [selectedSeats, setSelectedSeats] = useState([]);

  // Fetch seats from database
  const fetchSeats = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/showtimes/${SHOWTIME_ID}/seats`
      );

      const data = await response.json();

      setSeats(data.seats || []);
      setTicketPrice(data.ticketPrice || 0);
    } catch (error) {
      console.log("Error fetching seats:", error);
    }
  };

  // Load seats when page opens
  useEffect(() => {
    fetchSeats();
  }, []);

  // Select or unselect seat
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
    if (selectedSeats.length === 0) {
      alert("Select at least one seat");
      return;
    }

    try {
      // 1. Lock selected seats
      const lockResponse = await fetch(
        `${API_URL}/api/bookings/lock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            showtimeId: SHOWTIME_ID,
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

      // 2. Create Razorpay order
      const paymentResponse = await fetch(
        "http://localhost:5000/api/payments/create-order",
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

      const payment = await paymentResponse.json();

      if (!paymentResponse.ok) {
        alert(payment.message);
        return;
      }

      console.log("Payment order:", payment);

      // 3. Razorpay Checkout
      const options = {
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        order_id: payment.orderId,
        name: "Seat Lock Engine",

        handler: async function (response) {
          // 4. Verify payment signature
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

          // 5. Give webhook time to finalize booking
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
              // Clear selected seats
              setSelectedSeats([]);

              // Refresh seat status
              await fetchSeats();

              alert("Booking confirmed!");
            } else {
              alert(
                `Booking status: ${statusData.status}`
              );
            }
          }, 2000);
        },
      };

      // 6. Open Razorpay
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