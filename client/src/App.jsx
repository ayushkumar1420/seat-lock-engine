import { use, useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;
const USER_ID = "test-user";

function App() {
  const [showtimes, setshowtimes] = useState([]);
  const [selectedShowtime, setSelectedShowtime] = useState("");
  const [seats, setseats] = useState([]);
  const [ticketPrice, setTicketPrice] = useState(0);
  const [selectedSeats, setSelectedSeats]= useState([]);

  //to fetch a showtimes details
  useEffect(() => {
    const fetchShowtimes = async () => {
      try { 
        const response = await fetch(
          `${API_URL}/api/showtimes`
        );
        const data = await response.json();
        setshowtimes(data);

        //select first showtime by default
        if (data.length > 0) {
          setSelectedShowtime(data[0]._id);
        }
      } catch (error) {
        console.log("error fetching showtimes", error);
      }
    };
    fetchShowtimes();
  }, []);

  //fetch seats
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

  //now adding fetch seats when showtime changes
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
        selectedSeats.filter((item) => item !== seat.seatNumber));
    } else {
      setSelectedSeats([
        ...selectedSeats,
        seat.seatNumber,
      ]);
    }
  };

  const totalAmount = selectedSeats.length * ticketPrice;

  const handleBooking = async () => {
    if (!selectedShowtime) {
      alert("select a showtime");
      return;
    }

    if(selectedSeats.length === 0){
      alert("select at least one seat");
      return
    }

    try {
      //lock seats
      const lockResponse = await fetch(
        `${API_URL}/api/bookings/lock`,
        { method: "POST", headers: { "content-type": "appilcation/json"},
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

      console.log("booking", booking);
    }
  }


}

export default App;