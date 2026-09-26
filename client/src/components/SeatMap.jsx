function SeatMap({ seats, selectedSeats, onSelect }) {
    return (
        <div className="seat-map">
            {seats.map((seat) => (
                <button 
                key={seat._id} 
                disabled={seat.status === "BOOKED"}
                className={
                    selectedSeats.includes(seat.seatNumber) ? "seat selected" : seat.status === "BOOKED" ? "seat booked" : "seat" }
                    onClick={() => onSelect(seat)}> {seat.seatNumber} </button>
            ))}
        </div>
    );
}

export default SeatMap;