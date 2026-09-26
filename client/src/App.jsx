import { useState } from "react";
import AuthPage from "./pages/AuthPage";
import BookingPage from "./pages/BookingPage";
import "./App.css";


function App() {
    const [token, setToken] = useState(localStorage.getItem("token") || "");
    const [user, setUser] = useState(() => {
        const savedUser = localStorage.getItem("user");
        return savedUser ? JSON.parse(savedUser) : null;
    });

    const handleLogin = (token, user) => {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(user));
        setToken(token);
        setUser(user);
    };

    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken("");
        setUser(null);
    };

    if (!token) {
        return <AuthPage onLogin={handleLogin} />;
    }

    return (
        <BookingPage token={token} user={user} onLogout={logout}/>
    );
}

export default App;