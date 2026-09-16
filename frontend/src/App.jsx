import { useState, useEffect } from "react";

const API_BASE = "http://localhost:8000";

function App() {
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOwner() {
      const storedId = localStorage.getItem("ownerId");

      if (storedId) {
        // returning visitor — load their existing owner
        const res = await fetch(`${API_BASE}/owners/${storedId}`);
        const data = await res.json();
        setOwner(data);
      } else {
        // first-time visitor — create a new owner
        const res = await fetch(`${API_BASE}/owners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Owner" }),
        });
        const data = await res.json();
        localStorage.setItem("ownerId", data.id);
        setOwner(data);
      }

      setLoading(false);
    }

    loadOwner();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Welcome, {owner.name}</h1>
      <p>Owner ID: {owner.id}</p>
    </div>
  );
}

export default App;