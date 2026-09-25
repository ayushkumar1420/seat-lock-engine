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
}