import { useState, useEffect } from "react";

const API_BASE = "http://localhost:8000";

function App() {
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pets, setPets] = useState([]);
  const [newPet, setNewPet] = useState({ name: "", species: "", age: "" });

  useEffect(() => {
    async function loadOwner() {
      const storedId = localStorage.getItem("ownerId");
      let ownerData;

      if (storedId) {
        const res = await fetch(`${API_BASE}/owners/${storedId}`);
        ownerData = await res.json();
      } else {
        const res = await fetch(`${API_BASE}/owners`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Owner" }),
        });
        ownerData = await res.json();
        localStorage.setItem("ownerId", ownerData.id);
      }

      setOwner(ownerData);
      setLoading(false);
    }

    loadOwner();
  }, []);

  useEffect(() => {
    if (!owner) return;
    fetchPets();
  }, [owner]);

  async function fetchPets() {
    const res = await fetch(`${API_BASE}/owners/${owner.id}/pets`);
    const data = await res.json();
    setPets(data);
  }

  async function handleAddPet(e) {
    e.preventDefault();
    await fetch(`${API_BASE}/owners/${owner.id}/pets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPet.name,
        species: newPet.species,
        age: parseInt(newPet.age),
      }),
    });
    setNewPet({ name: "", species: "", age: "" });
    fetchPets();
  }

  async function handleDeletePet(petId) {
    await fetch(`${API_BASE}/pets/${petId}`, { method: "DELETE" });
    fetchPets();
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Welcome, {owner.name}</h1>

      <h2>Your Pets</h2>
      <ul>
        {pets.map((pet) => (
          <li key={pet.id}>
            {pet.name} — {pet.species}, age {pet.age}
            <button onClick={() => handleDeletePet(pet.id)}>Delete</button>
          </li>
        ))}
      </ul>

      <h3>Add a Pet</h3>
      <form onSubmit={handleAddPet}>
        <input
          placeholder="Name"
          value={newPet.name}
          onChange={(e) => setNewPet({ ...newPet, name: e.target.value })}
        />
        <input
          placeholder="Species"
          value={newPet.species}
          onChange={(e) => setNewPet({ ...newPet, species: e.target.value })}
        />
        <input
          placeholder="Age"
          type="number"
          value={newPet.age}
          onChange={(e) => setNewPet({ ...newPet, age: e.target.value })}
        />
        <button type="submit">Add Pet</button>
      </form>
    </div>
  );
}

export default App;