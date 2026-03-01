from typing import Annotated
from fastapi import FastAPI, File, Form, UploadFile, HTTPException


app = FastAPI()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"message": "Healthy!"}

@app.post("/upload")
async def upload(
    files: Annotated[list[UploadFile] | None, File()] = None,
    url: Annotated[str | None, Form()] = None,
):
    """
    Upload one or more files and/or a YouTube URL.

    Args:
        files (list[UploadFile] | None, File[]): List of files to upload.
        url (str | None, Form()): YouTube URL to upload.

    Returns:
        dict[str, int]: Dictionary with two keys: "files_provided" and "url_provided". The value of "files_provided" is the number of files provided, and the value of "url_provided" is a boolean indicating whether a URL was provided.

    Raises:
        HTTPException: If no files and no URL are provided, or if the URL is not from YouTube.
        HTTPException: If any of the files provided are not of type .docx or .pptx.
    """
    files_given = files is not None and len(files) > 0
    url_given = url is not None and url.strip() != ""

    if url_given:
        # Check it's from youtube
        if not url.startswith("https://www.youtube.com/watch?v="):
            raise HTTPException(
                status_code=422,
                detail="Invalid YouTube URL.",
            )

    if not files_given and not url_given:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one file or a YouTube URL.",
        )

    if files_given:
        for f in files:
            if not f.filename.lower().endswith((".docx", ".pptx")):
                raise HTTPException(
                    status_code=415,
                    detail=f"Unsupported file type: {f.filename}",
                )

    return {
        "files_provided": len(files) if files_given else 0,
        "url_provided": url_given,
    }