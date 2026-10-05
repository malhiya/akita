def test_create_pet(client):
    owner = client.post("/owners", json={"name": "Alex"}).json()

    response = client.post(
        f"/owners/{owner['id']}/pets",
        json={"name": "Buddy", "species": "Dog", "age": 3},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Buddy"
    assert data["owner_id"] == owner["id"]


def test_create_pet_for_nonexistent_owner_returns_404(client):
    response = client.post(
        "/owners/999/pets",
        json={"name": "Buddy", "species": "Dog", "age": 3},
    )
    assert response.status_code == 404


def test_list_pets_only_returns_this_owners_pets(client):
    owner_a = client.post("/owners", json={"name": "Alex"}).json()
    owner_b = client.post("/owners", json={"name": "Sam"}).json()

    client.post(
        f"/owners/{owner_a['id']}/pets",
        json={"name": "Buddy", "species": "Dog", "age": 3},
    )
    client.post(
        f"/owners/{owner_b['id']}/pets",
        json={"name": "Whiskers", "species": "Cat", "age": 5},
    )

    pets = client.get(f"/owners/{owner_a['id']}/pets").json()
    assert len(pets) == 1
    assert pets[0]["name"] == "Buddy"


def test_update_pet_partial(client):
    owner = client.post("/owners", json={"name": "Alex"}).json()
    pet = client.post(
        f"/owners/{owner['id']}/pets",
        json={"name": "Buddy", "species": "Dog", "age": 3},
    ).json()

    response = client.patch(f"/pets/{pet['id']}", json={"age": 4})
    assert response.status_code == 200
    data = response.json()
    assert data["age"] == 4
    assert data["name"] == "Buddy"


def test_delete_pet(client):
    owner = client.post("/owners", json={"name": "Alex"}).json()
    pet = client.post(
        f"/owners/{owner['id']}/pets",
        json={"name": "Buddy", "species": "Dog", "age": 3},
    ).json()

    assert client.delete(f"/pets/{pet['id']}").status_code == 200
    assert client.get(f"/owners/{owner['id']}/pets").json() == []