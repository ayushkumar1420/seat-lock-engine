function SeatMap({ seats, selectedSeats, onSelect }) {
console.log("Seat map props", { seats, selectedSeats, onSelect })
    return (
        <div className="seat-map">
            {seats.map((seat) => (
                <button 
                key={seat._id} 
                disabled={seat.status === "BOOKED" || seat.status === "LOCKED"}
                className={
                    selectedSeats.includes(seat.seatNumber) ? "seat selected" : seat.status === "BOOKED" ? "seat booked" : seat.status === "LOCKED" ? "seat locked" : "seat" }
                    onClick={() => onSelect(seat)}> {seat.seatNumber} </button>
            ))}
        </div>
    );
}

export default SeatMap;