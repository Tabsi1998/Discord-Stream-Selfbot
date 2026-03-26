"""
Proxy backend that forwards all requests to the Node.js control panel.
The actual control panel runs as a separate process managed by supervisor.
This lightweight FastAPI server just ensures the /api/* route contract is met.
"""
import os
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONTROL_PANEL_URL = "http://127.0.0.1:3099"


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_to_control_panel(path: str, request: Request):
    """Proxy all /api/* requests to the Node.js control panel."""
    url = f"{CONTROL_PANEL_URL}/api/{path}"
    
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=request.method,
                url=url,
                content=body,
                headers=headers,
                params=dict(request.query_params),
            )
            
            excluded_headers = {"content-encoding", "content-length", "transfer-encoding"}
            resp_headers = {
                k: v for k, v in response.headers.items()
                if k.lower() not in excluded_headers
            }
            
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=resp_headers,
            )
    except httpx.ConnectError:
        return JSONResponse(
            status_code=503,
            content={"error": "Control panel is starting up, please wait..."},
        )
    except Exception as e:
        return JSONResponse(
            status_code=502,
            content={"error": f"Proxy error: {str(e)}"},
        )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "discord-stream-selfbot-proxy"}
