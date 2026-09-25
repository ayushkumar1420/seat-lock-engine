import { useState, useEffect } from "react";
import SeatMap from "../components/SeatMap";
import API_URL from "../services/api";

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


}