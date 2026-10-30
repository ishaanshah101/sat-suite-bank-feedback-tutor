"use client";

import { useCallback, useSyncExternalStore } from "react";
import { downscaleCanvas } from "./image";

export type CaptureState = "unsupported" | "idle" | "connecting" | "live" | "ended";

interface CaptureStore {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  video: HTMLVideoElement | null;
  state: CaptureState;
  listeners: Set<() => void>;
}

// Module-level so client navigation keeps the share alive. A hard reload ends it (browser rule).
const store: CaptureStore = { stream: null, track: null, video: null, state: "idle", listeners: new Set() };

function setState(state: CaptureState) {
  store.state = state;
  store.listeners.forEach((fn) => fn());
}

export function captureSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean(navigator.mediaDevices?.getDisplayMedia) && "CaptureController" in window;
}

type CaptureControllerLike = { setFocusBehavior?: (behavior: string) => void };
type CaptureControllerCtor = new () => CaptureControllerLike;

async function nextFrame(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (typeof v.requestVideoFrameCallback === "function") v.requestVideoFrameCallback(finish);
    setTimeout(finish, timeoutMs);
  });
}

export async function connectCapture(): Promise<void> {
  if (!captureSupported()) throw new Error("Tab capture needs desktop Chrome or Edge.");
  stopCapture();
  setState("connecting");
  try {
    const Ctor = (window as unknown as { CaptureController?: CaptureControllerCtor }).CaptureController;
    const controller = Ctor ? new Ctor() : undefined;
    const options = {
      video: { displaySurface: "browser", width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { max: 5 } },
      audio: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      monitorTypeSurfaces: "exclude",
      preferCurrentTab: false,
      ...(controller ? { controller } : {}),
    } as unknown as DisplayMediaStreamOptions;
    const stream = await navigator.mediaDevices.getDisplayMedia(options);
    const track = stream.getVideoTracks()[0];
    try {
      const surface = (track.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface;
      if ((surface === "browser" || surface === "window") && controller?.setFocusBehavior) controller.setFocusBehavior("focus-capturing-application");
    } catch {
      // Focus window already closed or unsupported; harmless.
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await nextFrame(video, 1500);
    track.addEventListener("ended", () => {
      store.stream = null;
      store.track = null;
      store.video = null;
      setState("ended");
    });
    store.stream = stream;
    store.track = track;
    store.video = video;
    setState("live");
  } catch (error) {
    setState(store.stream ? "live" : "idle");
    throw error;
  }
}

export function stopCapture(): void {
  store.stream?.getTracks().forEach((t) => t.stop());
  store.stream = null;
  store.track = null;
  store.video = null;
  if (store.state !== "idle") setState("idle");
}

export async function grabFrame(): Promise<string> {
  const { track, video } = store;
  if (!track || !video || track.readyState !== "live") {
    setState(track ? "ended" : "idle");
    throw new Error("The shared tab is no longer connected. Click Reconnect.");
  }
  const surface = (track.getSettings() as MediaTrackSettings & { displaySurface?: string }).displaySurface;
  if (surface && surface !== "browser") {
    throw new Error("You are sharing a window or screen. Share the Question Bank tab instead.");
  }
  await nextFrame(video, 700);
  return downscaleCanvas(video);
}

function subscribe(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function getSnapshot(): CaptureState {
  return captureSupported() ? store.state : "unsupported";
}

function getServerSnapshot(): CaptureState {
  return "idle";
}

export function useCapture() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const connect = useCallback(() => connectCapture(), []);
  const grab = useCallback(() => grabFrame(), []);
  const stop = useCallback(() => stopCapture(), []);
  return { state, connect, grab, stop };
}
