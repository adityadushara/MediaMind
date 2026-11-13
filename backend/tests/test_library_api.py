def test_library_crud(client):
    # 1. Create a library item
    create_payload = {
        "title": "Designing Data-Intensive Applications",
        "creator": "Martin Kleppmann",
        "content_type": "book",
        "consumption_status": "want_to_consume",
        "release_year": 2017,
        "overview": "The big ideas behind reliable, scalable, and maintainable systems.",
        "user_rating": 9.5
    }
    response = client.post("/api/v1/library", json=create_payload)
    assert response.status_code == 201
    item = response.json()
    item_id = item["id"]
    assert item["title"] == create_payload["title"]
    assert item["verification_status"] == "manual_entry"

    # 2. Get the item by ID
    get_res = client.get(f"/api/v1/library/{item_id}")
    assert get_res.status_code == 200
    assert get_res.json()["creator"] == "Martin Kleppmann"

    # 3. List library items
    list_res = client.get("/api/v1/library?content_type=book")
    assert list_res.status_code == 200
    data = list_res.json()
    assert data["total"] >= 1
    assert any(x["id"] == item_id for x in data["items"])

    # 4. Update the item
    patch_payload = {
        "consumption_status": "consuming",
        "user_rating": 10.0
    }
    patch_res = client.patch(f"/api/v1/library/{item_id}", json=patch_payload)
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["consumption_status"] == "consuming"
    assert updated["user_rating"] == 10.0

    # 5. Delete the item
    del_res = client.delete(f"/api/v1/library/{item_id}")
    assert del_res.status_code == 204

    # 6. Verify deleted
    get_after = client.get(f"/api/v1/library/{item_id}")
    assert get_after.status_code == 404
