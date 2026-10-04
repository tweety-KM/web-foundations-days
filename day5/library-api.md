# Library API Design

A REST API for a library's **books** resource. Paths use the plural noun `/books`, and the HTTP method says what action to take.

## Endpoints

### 1. List all books
- **Method and path:** `GET /books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** `200 OK`

### 2. Get one book
- **Method and path:** `GET /books/{id}`
- **Description:** Returns a single book by its id.
- **Request body:** none
- **Success status:** `200 OK`

### 3. Create a book
- **Method and path:** `POST /books`
- **Description:** Adds a new book to the library.
- **Example request body:**
```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958,
    "isbn": "9780385474542"
  }
```
- **Success status:** `201 Created`

### 4. Update a book
- **Method and path:** `PUT /books/{id}`
- **Description:** Replaces the details of an existing book.
- **Example request body:**
```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958,
    "isbn": "9780385474542"
  }
```
- **Success status:** `200 OK`

### 5. Delete a book
- **Method and path:** `DELETE /books/{id}`
- **Description:** Removes a book from the library.
- **Request body:** none
- **Success status:** `204 No Content`

### 6. List books by an author
- **Method and path:** `GET /books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the author given in the `author` query parameter.
- **Request body:** none
- **Success status:** `200 OK`

## Error codes

- **400 Bad Request**
  - Meaning: the request is invalid or incomplete.
  - Example: `POST /books` is sent without a `title`, or with `year` set to the text "abc" instead of a number.
- **404 Not Found**
  - Meaning: the requested resource does not exist.
  - Example: `GET /books/9999` when no book has the id 9999.