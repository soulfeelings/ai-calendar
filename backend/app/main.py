import uvicorn
from fastapi import FastAPI

app = FastAPI()

@app.get("/healthcheck")
def healthcheck():
    return True

if __name__ == "__main__":
    uvicorn.run("main:app", reload=True, host="0.0.0.0", port=8000)