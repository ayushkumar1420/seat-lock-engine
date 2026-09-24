// import { useEffect, useState } from "react";
// import "./App.css";

// const API_URL = import.meta.env.VITE_API_URL;

// function App() {
//   // Auth
//   const [token, setToken] = useState(localStorage.getItem("token") || "");
//   const [user, setUser] = useState(() => {
//     const savedUser = localStorage.getItem("user");
//     return savedUser ? JSON.parse(savedUser) : null;
//   });

//   const [authMode, setAuthMode] = useState("login");
//   const [authForm, setAuthForm] = useState({
//     name: "",
//     email: "",
//     password: "",
//   });

//   // Booking
//   const [showtimes, setShowtimes] = useState([]);
//   const [selectedShowtime, setSelectedShowtime] = useState("");
//   const [seats, setSeats] = useState([]);
//   const [ticketPrice, setTicketPrice] = useState(0);
//   const [selectedSeats, setSelectedSeats] = useState([]);

//   // Register/Login
//   const handleAuth = async (e) => {
//     e.preventDefault();

//     const endpoint = authMode === "login" ? "login" : "register";
//     const body = {
//       email: authForm.email,
//       password: authForm.password,
//     };

//     if (authMode === "register") body.name = authForm.name;

//     try {
//       const response = await fetch(`${API_URL}/api/auth/${endpoint}`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(body),
//       });

//       const data = await response.json();

//       if (!response.ok) {
//         alert(data.message);
//         return;
//       }

//       if (authMode === "register") {
//         alert("Registration successful. Please login.");
//         setAuthMode("login");
//         setAuthForm({ name: "", email: authForm.email, password: "" });
//         return;
//       }

//       localStorage.setItem("token", data.token);
//       localStorage.setItem("user", JSON.stringify(data.user));

//       setToken(data.token);
//       setUser(data.user);
//       setAuthForm({ name: "", email: "", password: "" });
//     } catch (error) {
//       console.error("Authentication error:", error);
//       alert("Authentication failed");
//     }
//   };

//   const logout = () => {
//     localStorage.removeItem("token");
//     localStorage.removeItem("user");
//     setToken("");
//     setUser(null);
//     setSelectedSeats([]);
//   };

//   // Fetch showtimes
//   useEffect(() => {
//     const fetchShowtimes = async () => {
//       try {
//         const response = await fetch(`${API_URL}/api/showtimes`);
//         const data = await response.json();

//         setShowtimes(data);
//         if (data.length > 0) setSelectedShowtime(data[0]._id);
//       } catch (error) {
//         console.error("Failed to fetch showtimes:", error);
//       }
//     };

//     fetchShowtimes();
//   }, []);

//   // Fetch seats
//   const fetchSeats = async (showtimeId) => {
//     try {
//       const response = await fetch(`${API_URL}/api/showtimes/${showtimeId}/seats`);
//       const data = await response.json();

//       setSeats(data.seats || []);
//       setTicketPrice(data.ticketPrice || 0);
//     } catch (error) {
//       console.error("Failed to fetch seats:", error);
//     }
//   };

//   useEffect(() => {
//     if (!selectedShowtime) return;

//     fetchSeats(selectedShowtime);
//     setSelectedSeats([]);
//   }, [selectedShowtime]);

//   const selectSeat = (seat) => {
//     if (seat.status === "BOOKED") return;

//     if (selectedSeats.includes(seat.seatNumber)) {
//       setSelectedSeats(selectedSeats.filter((item) => item !== seat.seatNumber));
//     } else {
//       setSelectedSeats([...selectedSeats, seat.seatNumber]);
//     }
//   };

//   const totalAmount = selectedSeats.length * ticketPrice;

//   // Lock seats and start payment
//   const handleBooking = async () => {
//     if (!token) return alert("Please login first");
//     if (!selectedShowtime) return alert("Select a showtime");
//     if (selectedSeats.length === 0) return alert("Select at least one seat");

//     try {
//       const lockResponse = await fetch(`${API_URL}/api/bookings/lock`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         body: JSON.stringify({
//           showtimeId: selectedShowtime,
//           seats: selectedSeats,
//         }),
//       });

//       const booking = await lockResponse.json();

//       if (!lockResponse.ok) {
//         alert(booking.message);
//         return;
//       }

//       const paymentResponse = await fetch(`${API_URL}/api/payments/create-order`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         body: JSON.stringify({ bookingId: booking.bookingId }),
//       });

//       const payment = await paymentResponse.json();

//       if (!paymentResponse.ok) {
//         alert(payment.message);
//         return;
//       }

//       openRazorpay(payment, booking.bookingId);
//     } catch (error) {
//       console.error("Booking error:", error);
//       alert("Something went wrong");
//     }
//   };

//   // Open Razorpay checkout
//   const openRazorpay = (payment, bookingId) => {
//     if (!window.Razorpay) {
//       alert("Razorpay failed to load");
//       return;
//     }

//     const options = {
//       key: payment.keyId,
//       amount: payment.amount,
//       currency: payment.currency,
//       order_id: payment.orderId,
//       name: "Seat Lock Engine",

//       handler: async (response) => {
//         await verifyPayment(response, bookingId);
//       },
//     };

//     const razorpay = new window.Razorpay(options);
//     razorpay.open();
//   };

//   // Verify Razorpay payment
//   const verifyPayment = async (response, bookingId) => {
//     try {
//       const verifyResponse = await fetch(`${API_URL}/api/payments/verify`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         body: JSON.stringify({
//           razorpay_order_id: response.razorpay_order_id,
//           razorpay_payment_id: response.razorpay_payment_id,
//           razorpay_signature: response.razorpay_signature,
//         }),
//       });

//       const data = await verifyResponse.json();

//       if (!verifyResponse.ok) {
//         alert(data.message);
//         return;
//       }

//       // Webhook finalizes the booking
//       setTimeout(() => checkBookingStatus(bookingId), 2000);
//     } catch (error) {
//       console.error("Payment verification error:", error);
//       alert("Payment verification failed");
//     }
//   };

//   // Check whether webhook completed the booking
//   const checkBookingStatus = async (bookingId) => {
//     try {
//       const response = await fetch(`${API_URL}/api/bookings/${bookingId}/status`);
//       const data = await response.json();

//       if (data.status === "SUCCESS") {
//         setSelectedSeats([]);
//         await fetchSeats(selectedShowtime);
//         alert("Booking confirmed!");
//         return;
//       }

//       alert(`Booking status: ${data.status}`);
//     } catch (error) {
//       console.error("Failed to check booking status:", error);
//     }
//   };

//   // Login/Register screen
//   if (!token) {
//     return (
//       <div className="app">
//         <h1>Seat Lock Engine</h1>
//         <h2>{authMode === "login" ? "Login" : "Register"}</h2>

//         <form className="auth-form" onSubmit={handleAuth}>
//           {authMode === "register" && (
//             <input
//               type="text"
//               placeholder="Name"
//               value={authForm.name}
//               onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
//               required
//             />
//           )}

//           <input
//             type="email"
//             placeholder="Email"
//             value={authForm.email}
//             onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
//             required
//           />

//           <input
//             type="password"
//             placeholder="Password"
//             value={authForm.password}
//             onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
//             required
//           />

//           <button type="submit">
//             {authMode === "login" ? "Login" : "Register"}
//           </button>
//         </form>

//         <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
//           {authMode === "login" ? "Create Account" : "Already have an account? Login"}
//         </button>
//       </div>
//     );
//   }

//   // Seat booking screen
//   return (
//     <div className="app">
//       <div className="user-info">
//         <p>Logged in as <strong>{user?.name}</strong></p>
//         <button onClick={logout}>Logout</button>
//       </div>

//       <h1>Select Seats</h1>

//       <label>Showtime: </label>
//       <select
//         value={selectedShowtime}
//         onChange={(e) => setSelectedShowtime(e.target.value)}
//       >
//         {showtimes.map((showtime) => (
//           <option key={showtime._id} value={showtime._id}>
//             {new Date(showtime.startTime).toLocaleString()} - ₹{showtime.ticketPrice}
//           </option>
//         ))}
//       </select>

//       <p>₹{ticketPrice} per seat</p>

//       <div className="seat-map">
//         {seats.map((seat) => (
//           <button
//             key={seat._id}
//             disabled={seat.status === "BOOKED"}
//             className={
//               selectedSeats.includes(seat.seatNumber)
//                 ? "seat selected"
//                 : seat.status === "BOOKED"
//                 ? "seat booked"
//                 : "seat"
//             }
//             onClick={() => selectSeat(seat)}
//           >
//             {seat.seatNumber}
//           </button>
//         ))}
//       </div>

//       <p>Selected: {selectedSeats.length ? selectedSeats.join(", ") : "None"}</p>
//       <h3>Total: ₹{totalAmount}</h3>

//       <button className="book-button" onClick={handleBooking}>
//         Book Seats
//       </button>
//     </div>
//   );
// }

// export default App;