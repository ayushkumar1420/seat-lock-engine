import { useMemo, useState } from "react";
import "./App.css";

const seatLayout = [
  ["A1", "A2", "A3", "A4"],
  ["B1", "B2", "B3", "B4"],
  ["C1", "C2", "C3", "C4"],
];

const bookedSeats = ["A2", "C4"];
const TICKET_PRICE = 250;

function App(){
  const [selectedSeats, setselectedSeats] = useState([]);

  const handleSeatClick = (seat) => {
    if (bookedSeats.includes(seats)) {
      return;
    }

    setselectedSeats((currentSeats) => {
      if (currentSeats.includes(seat)) {
        return currentSeats.filter(
          (selectedSeats) => selectedSeats !== seat
        );
      }

      return [...currentSeats, seat];
    });
  };

  
}