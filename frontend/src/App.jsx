import { useState, useEffect } from "react";

function App() {
  const [status, setStatus] = useState("loading...");

  useEffect(() => {
    fetch("http://localhost:8000/")
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch((err) => setStatus("error: " + err.message));
  }, []);

  return (
    <div>
      <h1>Backend says: {status}</h1>
    </div>
  );
}

export default App;