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
}

export default App;