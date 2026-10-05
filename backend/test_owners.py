def test_create_owner(client):
    response = client.post("/owners", json={"name": "Alex"})
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Alex"
    assert data["id"] is not None


def test_get_owner(client):
    created = client.post("/owners", json={"name": "Jamie"}).json()

    response = client.get(f"/owners/{created['id']}")
    assert response.status_code == 200
    assert response.json()["name"] == "Jamie"


def test_get_nonexistent_owner_returns_404(client):
    response = client.get("/owners/999")
    assert response.status_code == 404