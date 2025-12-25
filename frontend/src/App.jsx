import { useState } from "react";

export default function App() {
  const [message, setMessage] = useState("");

  const ping = async () => {
    const res = await fetch("http://127.0.0.1:8000/ping");
    const data = await res.json();
    setMessage(data.message);
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>HeatSight — Front ↔ Back</h1>
      <button onClick={ping}>Ping backend</button>
      <p>Réponse : {message}</p>
    </div>
  );
}
