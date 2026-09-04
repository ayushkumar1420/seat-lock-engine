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

  const totalAmount = useMemo(() => {
    return selectedSeats.length * TICKET_PRICE;
  }, [selectedSeats]);

  const handleBooking = () => {
    if (selectedSeats.length === 0) {
      alert("please select at least one seat");
      return;
    }

    console.log({ selectedSeats, totalAmount });
  };

    return (
    <main className="app">
      <section className="booking-card">
        <header className="booking-header">
          <p className="eyebrow">Seat Lock Engine</p>
          <h1>Select your seats</h1>
          <h1>Select your seats</h1>
          <p className="subtext">Showtime: 7:00 PM · ₹{TICKET_PRICE} per seat</p>
        </header>

        <div className="screen">SCREEN</div>
        <div className="seat-map">
          {seatLayout.map((row, rowIndex) => (
            <div className="seat-row" key={rowIndex}>
              <span className="row-label">{row[0][0]}</span>

              {row.map((seat) => {
                const isBooked = bookedSeats.includes(seat);
                const isSelected = selectedSeats.includes(seat);

                let className = "seat";

                if (isBooked) {
                  className += " booked";
                } else if (isSelected) {
                  className += " selected";
                }

                return (
                  <button
                    key={seat}
                    className={className}
                    disabled={isBooked}
                    onClick={() =>
                      handleSeatClick(seat)
                    }
                  >
                    {seat}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="legend">
          <span>
            <i className="legend-box available" />
            Available
          </span>

          <span>
            <i className="legend-box selected" />
            Selected
          </span>

          <span>
            <i className="legend-box booked" />
            Booked
          </span>
        </div>

        <div className="summary">
          <div>
            <span className="summary-label">
              Selected seats
            </span>

            <strong>
              {selectedSeats.length > 0
                ? selectedSeats.join(", ")
                : "None"}
            </strong>
          </div>

          <div>
            <span className="summary-label">
              Total
            </span>

            <strong>
              ₹{totalAmount}
            </strong>
          </div>
        </div>

        <button
          className="book-button"
          onClick={handleBooking}
        >
          Book Seats
        </button>
      </section>
    </main>
  );
}