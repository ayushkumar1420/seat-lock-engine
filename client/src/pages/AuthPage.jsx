import { useState } from "react";
import API_URL from "../services/api";

function AuthPage({ onLogin }) {
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({
        name: "", email: "", password: "",
    });

    const handleSubmit = async (e) => {
        e.preventDefault();

        const body = {
            email: form.email,
            password: form.password,
        };

        if (mode === "register") body.name = form.name;

        try {
            const response = await fetch(`${API_URL}/api/auth/${mode}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if(!response.ok) {
                alert(data.message);
                return;
            }

            if (mode === "register"){
                alert("account created, please login");
                setMode("login");
                setForm({ name: "", email: form.email, password: "" });
                return;
            }

            onLogin(data.token, data.user);
        } catch (error) {
            console.error("authentication failed", error);
            alert("something went wrong");
        }
    };

    return (
        <div className="app">
            <h1> Seat Lock Engine </h1>
            <h2>{mode === "login" ? "login" : "register"}</h2>

            <form className="auth-form" onSubmit={handleSubmit}>
                {mode === "register" && (
                    <input 
                    type="text"
                    placeholder="Name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                />
                )}

                <input 
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />

                <input 
                  type="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />

                <button type="submit">
                    {mode === "login" ? "login" : "register"}
                </button>
            </form>

            <button onClick={() => setMode(mode === "login" ? "register" : "login")}>
                {mode === "login" ? "create account" : "already have an account? Login"}
            </button>
        </div>
    );
}

export default AuthPage;