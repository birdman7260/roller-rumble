import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, FileButton } from "@roller-rumble/shared-ui";

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

/**
 * A full-screen selfie camera for the racer's photo. It asks for the front camera by name, which
 * Android's own camera app does not reliably honor from a `capture="user"` file input. The shutter
 * sends the frame as a JPEG, and "Choose from library" at the bottom sends a photo from the library
 * instead. The preview is mirrored, and so is the saved photo, so it matches what the racer sees.
 */
export function SelfieCamera({
  onCapture,
  onLibraryFile,
  onClose
}: {
  onCapture: (file: File) => void;
  onLibraryFile: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "unavailable">("starting");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "user" } }, audio: false })
      .then((mediaStream) => {
        if (cancelled) {
          stopStream(mediaStream);
          return;
        }
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setCameraState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setCameraState("unavailable");
        }
      });

    return () => {
      cancelled = true;
      if (stream) {
        stopStream(stream);
      }
    };
  }, []);

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturing(true);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
        } else {
          setCapturing(false);
        }
      },
      "image/jpeg",
      0.92
    );
  }

  function handleLibraryChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      onLibraryFile(file);
    }
  }

  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) {
          dialog.showModal();
        }
      }}
      className="racer-selfie-camera"
      aria-label="Take a selfie"
      onCancel={(event) => {
        // Escape goes through onClose so the parent stays the source of truth for the dialog.
        event.preventDefault();
        onClose();
      }}
    >
      <video
        ref={videoRef}
        className={`racer-selfie-camera__video${cameraState === "ready" ? "" : " is-hidden"}`}
        aria-label="Live camera preview"
        autoPlay
        muted
        playsInline
      />
      {cameraState === "starting" ? (
        <p className="racer-selfie-camera__status">Starting camera…</p>
      ) : null}
      {cameraState === "unavailable" ? (
        <p className="racer-selfie-camera__status" role="alert">
          Camera unavailable. Choose a photo from your library instead.
        </p>
      ) : null}
      <Button variant="ghost" className="racer-selfie-camera__close" onClick={onClose}>
        Close
      </Button>
      <div className="racer-selfie-camera__controls">
        <button
          type="button"
          className="racer-selfie-camera__shutter"
          aria-label="Take photo"
          disabled={cameraState !== "ready" || capturing}
          onClick={capturePhoto}
        />
        <FileButton
          variant="ghost"
          accept="image/*"
          className="racer-selfie-camera__library"
          onChange={handleLibraryChange}
        >
          Choose from library
        </FileButton>
      </div>
    </dialog>
  );
}
