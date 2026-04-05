export function tone(freq: number, duration = 0.13): void {
  try {
    const windowWithPrefix = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = window.AudioContext || windowWithPrefix.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.value = 0.11;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => ctx.close().catch(() => null);
  } catch {
    // ignore audio errors
  }
}

export function playNotification(type: "otp" | "sent" | "received"): void {
  if (type === "otp") {
    tone(720, 0.14);
    setTimeout(() => tone(820, 0.1), 160);
    return;
  }
  if (type === "sent") {
    tone(940, 0.08);
    return;
  }
  tone(520, 0.12);
  setTimeout(() => tone(620, 0.08), 120);
}

export async function api<T>(path: string, opts: RequestInit & { token?: string } = {}): Promise<T> {
  const appProtocol = window.location.protocol?.startsWith("http") ? window.location.protocol : "http:";
  const appHostname = window.location.hostname && window.location.hostname !== "" && window.location.hostname !== "chrome-error" ? window.location.hostname : "localhost";
  const API = import.meta.env.VITE_API_URL ?? `${appProtocol}//${appHostname}:8787`;
  
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof body === "string" ? body : body.error || `HTTP ${res.status}`);
  return body as T;
}

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtDate = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const initials = (name: string) => name.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
export const lastSeen = (user: { isOnline?: boolean; lastSeenAt?: string | null } | null) => {
  if (!user) return "";
  return user.isOnline ? "online" : user.lastSeenAt ? `last seen ${fmtDate(user.lastSeenAt)}` : "offline";
};

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function messageTypeFromMime(mime: string): "text" | "image" | "video" | "file" | "audio" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((v) => v.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((v) => v.trim());
    const get = (name: string) => cells[header.indexOf(name)] || "";
    return { name: get("name"), phoneNumber: get("phonenumber") || get("phone"), email: get("email"), avatarUrl: get("avatarurl") || "" };
  }).filter((row) => row.name || row.phoneNumber || row.email);
}
