import io
from PIL import Image


def generate_test_image(color: str = "green") -> bytes:
    img = Image.new("RGB", (100, 150), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_library_crud_and_content_types(client):
    # 1. Create a library item with 'other' content type
    create_payload = {
        "title": "Substack Deep Dive: Modern AI Infrastructure",
        "creator": "Latent Space",
        "content_type": "other",
        "consumption_status": "want_to_consume",
        "release_year": 2024,
        "overview": "Deep dive newsletter into modern GPU clusters and inference optimization.",
        "user_rating": 8.5
    }
    response = client.post("/api/v1/library", json=create_payload)
    assert response.status_code == 201
    item = response.json()
    item_id = item["id"]
    assert item["content_type"] == "other"
    assert item["title"] == create_payload["title"]

    # 2. Get item by ID
    get_res = client.get(f"/api/v1/library/{item_id}")
    assert get_res.status_code == 200
    assert get_res.json()["creator"] == "Latent Space"

    # 3. List and sort by updated_at
    list_res = client.get("/api/v1/library?sort_by=updated_at&order=desc")
    assert list_res.status_code == 200
    assert list_res.json()["total"] >= 1

    # 4. Update item
    patch_res = client.patch(f"/api/v1/library/{item_id}", json={"consumption_status": "completed"})
    assert patch_res.status_code == 200
    assert patch_res.json()["consumption_status"] == "completed"

    # 5. Delete item
    del_res = client.delete(f"/api/v1/library/{item_id}")
    assert del_res.status_code == 204


def test_source_preservation_after_library_item_deletion(client):
    # 1. Upload screenshot
    img_bytes = generate_test_image()
    upload_res = client.post(
        "/api/v1/assets/upload",
        files=[("files", ("preserved_screenshot.png", io.BytesIO(img_bytes), "image/png"))]
    )
    asset_id = upload_res.json()["assets"][0]["asset_id"]

    # 2. Create library item linked to this asset
    create_res = client.post("/api/v1/library", json={
        "title": "Algorithms to Live By",
        "creator": "Brian Christian",
        "content_type": "book",
        "source_asset_id": asset_id
    })
    item_id = create_res.json()["id"]

    # 3. Delete the library item
    del_res = client.delete(f"/api/v1/library/{item_id}")
    assert del_res.status_code == 204

    # 4. CRITICAL: Verify source screenshot remains fully intact and accessible!
    asset_res = client.get(f"/api/v1/assets/{asset_id}")
    assert asset_res.status_code == 200
    assert asset_res.json()["file_name"] == "preserved_screenshot.png"


def test_many_to_many_associations(client):
    # Upload 2 screenshots
    img1 = generate_test_image("blue")
    img2 = generate_test_image("red")
    res1 = client.post("/api/v1/assets/upload?force_reupload=true", files=[("files", ("shot1.png", io.BytesIO(img1), "image/png"))])
    res2 = client.post("/api/v1/assets/upload?force_reupload=true", files=[("files", ("shot2.png", io.BytesIO(img2), "image/png"))])
    asset1_id = res1.json()["assets"][0]["asset_id"]
    asset2_id = res2.json()["assets"][0]["asset_id"]

    # Create 2 library items
    item1 = client.post("/api/v1/library", json={"title": "Item One", "content_type": "book"}).json()
    item2 = client.post("/api/v1/library", json={"title": "Item Two", "content_type": "movie"}).json()

    # Link Asset 1 to Item 1 AND Item 2 (One source to multiple items)
    link1 = client.post(f"/api/v1/library/{item1['id']}/sources/{asset1_id}")
    assert link1.status_code == 201

    link2 = client.post(f"/api/v1/library/{item2['id']}/sources/{asset1_id}")
    assert link2.status_code == 201

    # Link Asset 2 to Item 1 (Multiple sources to one item)
    link3 = client.post(f"/api/v1/library/{item1['id']}/sources/{asset2_id}")
    assert link3.status_code == 201

    # Verify Item 1 has 2 linked sources
    detail1 = client.get(f"/api/v1/library/{item1['id']}").json()
    assert len(detail1["sources"]) == 2
    source_ids = [s["id"] for s in detail1["sources"]]
    assert asset1_id in source_ids
    assert asset2_id in source_ids

    # Unlink Asset 2 from Item 1
    unlink_res = client.delete(f"/api/v1/library/{item1['id']}/sources/{asset2_id}")
    assert unlink_res.status_code == 204

    # Verify Asset 2 still exists
    assert client.get(f"/api/v1/assets/{asset2_id}").status_code == 200

    # Verify Item 1 now only has 1 linked source
    detail1_after = client.get(f"/api/v1/library/{item1['id']}").json()
    assert len(detail1_after["sources"]) == 1


def test_cross_user_association_prevention(client):
    user_a = "user-a-assoc-1111"
    user_b = "user-b-assoc-2222"

    # User A uploads asset
    img = generate_test_image()
    res_a = client.post(
        "/api/v1/assets/upload",
        files=[("files", ("asset_a.png", io.BytesIO(img), "image/png"))],
        headers={"X-Dev-User-Id": user_a}
    )
    asset_id_a = res_a.json()["assets"][0]["asset_id"]

    # User B creates library item
    item_b = client.post(
        "/api/v1/library",
        json={"title": "User B Item", "content_type": "book"},
        headers={"X-Dev-User-Id": user_b}
    ).json()
    item_id_b = item_b["id"]

    # User B attempts to link User A's asset to User B's item -> Must be rejected with 404
    link_attempt = client.post(
        f"/api/v1/library/{item_id_b}/sources/{asset_id_a}",
        headers={"X-Dev-User-Id": user_b}
    )
    assert link_attempt.status_code == 404

    # User A attempts to link their asset to User B's item -> Must be rejected with 404
    link_attempt_2 = client.post(
        f"/api/v1/library/{item_id_b}/sources/{asset_id_a}",
        headers={"X-Dev-User-Id": user_a}
    )
    assert link_attempt_2.status_code == 404


def test_library_subcategory_and_direct_url(client):
    user_id = "user-subcat-test"
    headers = {"X-Dev-User-Id": user_id}

    # Create books with different subcategories
    b1 = client.post(
        "/api/v1/library",
        json={
            "title": "Thinking, Fast and Slow",
            "creator": "Daniel Kahneman",
            "content_type": "book",
            "subcategory": "Psychology",
            "direct_url": "https://books.google.com/sample1"
        },
        headers=headers,
    ).json()

    b2 = client.post(
        "/api/v1/library",
        json={
            "title": "Atomic Habits",
            "creator": "James Clear",
            "content_type": "book",
            "subcategory": "Habits",
        },
        headers=headers,
    ).json()

    # Verify auto-generated direct link for b2
    assert "https://www.google.com/search?tbm=bks" in b2["direct_url"]
    assert b2["subcategory"] == "Habits"

    # Filter by subcategory Habits
    habits_res = client.get("/api/v1/library?content_type=book&subcategory=Habits", headers=headers)
    assert habits_res.status_code == 200
    habits_items = habits_res.json()["items"]
    assert len(habits_items) == 1
    assert habits_items[0]["title"] == "Atomic Habits"

    # Check subcategories endpoint
    sub_res = client.get("/api/v1/library/subcategories?content_type=book", headers=headers)
    assert sub_res.status_code == 200
    subcats = sub_res.json()
    assert "Psychology" in subcats
    assert "Habits" in subcats
