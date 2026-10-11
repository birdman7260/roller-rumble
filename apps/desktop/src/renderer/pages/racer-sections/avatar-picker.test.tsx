import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AvatarPicker } from "./avatar-picker";

function stubCamera(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
}

function fakeStream(track: { stop: () => void }) {
  return { getTracks: () => [track] } as unknown as MediaStream;
}

function renderPicker(onUpload = vi.fn()) {
  render(
    <AvatarPicker avatarUrl={null} displayName="Turbo Tortoise" busy={false} onUpload={onUpload} />
  );
  return onUpload;
}

describe("AvatarPicker", () => {
  afterEach(() => {
    delete (navigator as { mediaDevices?: unknown }).mediaDevices;
    vi.restoreAllMocks();
  });

  it("opens a selfie camera that asks for the front camera", async () => {
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn(async () => fakeStream(track));
    stubCamera(getUserMedia);
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: "user" } },
      audio: false
    });
    const dialog = screen.getByRole("dialog", { name: "Take a selfie" });
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Take photo" })).toBeEnabled();
    });
    expect(within(dialog).getByLabelText("Choose from library")).toHaveAttribute(
      "accept",
      "image/*"
    );
  });

  it("sends a library photo picked on the camera screen and stops the camera", async () => {
    const track = { stop: vi.fn() };
    stubCamera(async () => fakeStream(track));
    const onUpload = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
    const dialog = screen.getByRole("dialog", { name: "Take a selfie" });
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Take photo" })).toBeEnabled();
    });

    fireEvent.change(within(dialog).getByLabelText("Choose from library"), {
      target: { files: [new File(["library"], "library.jpg", { type: "image/jpeg" })] }
    });

    expect(onUpload).toHaveBeenCalledWith(expect.any(File));
    expect(screen.queryByRole("dialog", { name: "Take a selfie" })).not.toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
  });

  it("says so when the camera won't open and still offers the library", async () => {
    stubCamera(async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    });
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Camera unavailable");
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(screen.getAllByLabelText("Choose from library")).toHaveLength(2);
  });

  it("falls back to the phone's camera app where the browser has no camera API", () => {
    const click = vi.spyOn(HTMLElement.prototype, "click");
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Add photo" }));

    const [target] = click.mock.contexts as HTMLElement[];
    expect(target).toBeInstanceOf(HTMLInputElement);
    expect(target).toHaveAttribute("capture", "user");
    expect(screen.queryByRole("dialog", { name: "Take a selfie" })).not.toBeInTheDocument();
  });
});
