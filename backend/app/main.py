import uvicorn
from fastapi import FastAPI
from api import routers
app = FastAPI()

for i in routers:
    app.include_router(i)

@app.get("/healthcheck")
async def healthcheck():
    return True

if __name__ == "__main__":
    uvicorn.run("main:app", reload=True, host="0.0.0.0", port=8000)