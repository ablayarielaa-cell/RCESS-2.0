import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  Newspaper,
  PhoneCall,
  Copy,
  Trophy,
  MapPinned,
  ClipboardList,
  Settings,
  CalendarCheck,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import logo from "@/assets/RCESS.png";
import { clearSession, getSession } from "@/lib/auth";
import {
  loadStore,
  saveStore,
  nanoId,
  buildSingleElimRounds,
  buildDoubleElimExtras,
} from "@/lib/store";
import type {
  Bracket,
  MapInfo,
  NewsItem,
  NewsType,
  Sport,
  SummitInfo,
  ScoreRow,
  MatchSchedulePost,
  MatchScheduleStatus,
} from "@/lib/store";

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL DIRECTION (match Home):
// Neon-console / blueprint grid / glass panels.
// Dashboard layout, tabs bar, and content card mimic screenshot.
// ─────────────────────────────────────────────────────────────────────────────

function formatPosted(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// Search saved emergency contact fields for an already-entered phone number. The app
// reuses this value for Emergency Hotline rather than inventing a contact.
function extractEmergencyPhoneNumber(item: Partial<SummitInfo>): string {
  const values = [item.title, item.subtitle, item.venue, item.dateLabel, item.notes]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const source = values.join("\n");
  const patterns = [
    /\+?63[\s().-]*(?:\(?\d{2,3}\)?[\s().-]*)?\d{3,4}[\s.-]*\d{4}/g,
    /(?:^|[^\d])0(?:[\s().-]*\d){9,10}(?=$|[^\d])/g,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[0]) return match[0].trim().replace(/^[^+0-9]+/, "").replace(/[^0-9]+$/, "");
  }
  // Respect a short emergency number only if it was explicitly saved in the
  // contact field itself; do not assume a default number.
  const contactField = (item.venue ?? "").trim();
  if (/^(?:911|112|117|999)$/.test(contactField)) return contactField;
  return "";
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to a temporary text field for browsers without clipboard access.
  }

  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    field.style.pointerEvents = "none";
    document.body.appendChild(field);
    field.focus();
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

function PortalHeader() {
  return (
    <div data-tour-target="welcome" className="flex items-start justify-between gap-6">
      <div className="flex items-center gap-4">
        <div className="rcess-logoWrap">
          <img
            src={logo}
            alt="Organization logo"
            className="h-30 w-30 rounded-full bg-white object-contain p-1"
          />
        </div>
        <div>
          <div className="text-[11px] tracking-[0.45em] text-cyan-300/80">PARSU • RCESS</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">RCESS</div>
          <div className="mt-0.5 text-sm text-white/55">Dashboard</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge className="bg-white/10 text-white border border-white/15 hover:bg-white/10">Live</Badge>
      </div>

    </div>
  );
}

function NewsEditor({
  item,
  onSave,
  onDelete,
}: {
  item?: NewsItem;
  onSave: (next: NewsItem) => void;
  onDelete?: (item: NewsItem) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [type, setType] = useState<NewsType>(item?.type ?? "Announcement");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">TITLE</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-black/30 border-white/15 text-white placeholder:text-white/35"
          placeholder="Announcement title"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">TYPE</label>
        <Select value={type} onValueChange={(v) => setType(v as NewsType)}>
          <SelectTrigger className="bg-black/30 border-white/15 text-white">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Announcement">Announcement</SelectItem>
            <SelectItem value="Update">Update</SelectItem>
            <SelectItem value="Reminder">Reminder</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">BODY</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[140px] bg-black/30 border-white/15 text-white placeholder:text-white/35"
          placeholder="Write the announcement details"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        {item && onDelete ? (
          <>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Delete news
            </Button>
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <DialogContent className="w-[calc(100%-2rem)] max-w-md border-white/15 bg-[#050820] text-white shadow-2xl">
                <DialogHeader>
                  <DialogTitle>Delete news?</DialogTitle>
                </DialogHeader>
                <p className="text-sm leading-relaxed text-white/70">
                  Are you sure you want to delete “{item.title}”? This action cannot be undone.
                </p>
                <div className="mt-2 flex justify-end gap-3">
                  <Button type="button" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => setDeleteConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      setDeleteConfirmOpen(false);
                      onDelete(item);
                    }}
                  >
                    Delete news
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : <span />}
        <Button
          className="bg-cyan-300 text-black hover:bg-cyan-200"
          onClick={() => {
            if (!title.trim()) {
              toast.error("Title is required");
              return;
            }
            onSave({
              id: item?.id ?? nanoId(),
              title: title.trim(),
              body: body.trim(),
              type,
              postedAtIso: item?.postedAtIso ?? new Date().toISOString(),
            });
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function ScheduleEditor({
  sports,
  onSave,
}: {
  sports: string[];
  onSave: (p: MatchSchedulePost) => void;
}) {
  const [sport, setSport] = useState<string>(sports[0] ?? "Basketball");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [timeLocal, setTimeLocal] = useState("");
  const [status, setStatus] = useState<MatchScheduleStatus>("Starting");

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">SPORT</label>
        <Select value={sport} onValueChange={(v) => setSport(v)}>
          <SelectTrigger className="bg-black/30 border-white/15 text-white">
            <SelectValue placeholder="Select sport" />
          </SelectTrigger>
          <SelectContent>
            {sports.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">MATCHUP TITLE</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-black/30 border-white/15 text-white"
          placeholder="Team A vs Team B"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">LOCATION</label>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="bg-black/30 border-white/15 text-white"
          placeholder="Main Court"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">TIME</label>
        <Input
          value={timeLocal}
          onChange={(e) => setTimeLocal(e.target.value)}
          type="datetime-local"
          className="bg-black/30 border-white/15 text-white"
        />
        <div className="text-xs text-white/35">This is the time shown to viewers.</div>
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">STATUS</label>
        <Select value={status} onValueChange={(v) => setStatus(v as MatchScheduleStatus)}>
          <SelectTrigger className="bg-black/30 border-white/15 text-white">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Starting">Starting</SelectItem>
            <SelectItem value="In Game">In Game</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end">
        <Button
          className="bg-cyan-300 text-black hover:bg-cyan-200"
          onClick={() => {
            if (!title.trim()) {
              toast.error("Title is required");
              return;
            }
            if (!timeLocal.trim()) {
              toast.error("Time is required");
              return;
            }
            const timeIso = new Date(timeLocal).toISOString();
            onSave({
              id: nanoId(),
              sport,
              title: title.trim(),
              location: location.trim(),
              timeIso,
              status,
              postedAtIso: new Date().toISOString(),
            });
          }}
        >
          Post
        </Button>
      </div>
    </div>
  );
}

function SummitEditor({ value, onSave, onDelete }: { value: SummitInfo; onSave: (v: SummitInfo) => void; onDelete?: () => void }) {
  const [draft, setDraft] = useState<SummitInfo>(() => ({
    ...value,
    // Reuse the contact number from the existing saved contact details when available.
    venue: extractEmergencyPhoneNumber(value),
  }));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">HOTLINE / SERVICE NAME</label>
        <Input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className="bg-black/30 border-white/15 text-white"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">DEPARTMENT / AGENCY</label>
        <Input
          value={draft.subtitle}
          onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
          className="bg-black/30 border-white/15 text-white"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">CONTACT NUMBER</label>
        <Input
          value={draft.venue}
          onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
          className="bg-black/30 border-white/15 text-white"
          placeholder="Enter contact number"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">AVAILABILITY / HOURS</label>
        <Input
          value={draft.dateLabel}
          onChange={(e) => setDraft({ ...draft, dateLabel: e.target.value })}
          className="bg-black/30 border-white/15 text-white"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">INSTRUCTIONS / NOTES</label>
        <Textarea
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          className="min-h-[120px] bg-black/30 border-white/15 text-white"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        {onDelete ? (
          <>
            <Button type="button" variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
              Delete hotline contact
            </Button>
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <DialogContent className="w-[calc(100%-2rem)] max-w-md border-white/15 bg-[#050820] text-white shadow-2xl">
                <DialogHeader>
                  <DialogTitle>Delete hotline contact?</DialogTitle>
                </DialogHeader>
                <p className="text-sm leading-relaxed text-white/70">
                  Are you sure you want to delete “{draft.title || "Emergency Hotline"}”? This action cannot be undone.
                </p>
                <div className="mt-2 flex justify-end gap-3">
                  <Button type="button" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => setDeleteConfirmOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" onClick={() => {
                    setDeleteConfirmOpen(false);
                    onDelete();
                  }}>
                    Delete hotline contact
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : <span />}
        <Button className="bg-cyan-300 text-black hover:bg-cyan-200" onClick={() => onSave(draft)}>
          Save
        </Button>
      </div>
    </div>
  );
}

type MapLocation = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};
type MultiMapInfo = MapInfo & { locations?: MapLocation[] };

const mapPinIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitLocations({ locations }: { locations: MapLocation[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = locations.filter((location) => Number.isFinite(location.lat) && Number.isFinite(location.lng));
    if (valid.length === 1) {
      map.setView([valid[0].lat!, valid[0].lng!], 14);
    } else if (valid.length > 1) {
      map.fitBounds(valid.map((location) => [location.lat!, location.lng!] as [number, number]), { padding: [30, 30], maxZoom: 14 });
    }
  }, [locations, map]);
  return null;
}

function MultiLocationMap({ locations }: { locations: MapLocation[] }) {
  const valid = locations.filter((location) => Number.isFinite(location.lat) && Number.isFinite(location.lng));
  if (!valid.length) return null;
  const center: [number, number] = [
    valid.reduce((sum, location) => sum + location.lat!, 0) / valid.length,
    valid.reduce((sum, location) => sum + location.lng!, 0) / valid.length,
  ];
  return (
    <MapContainer center={center} zoom={12} scrollWheelZoom className="h-[300px] sm:h-[420px] w-full z-0">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitLocations locations={valid} />
      {valid.map((location, index) => (
        <Marker key={location.id} position={[location.lat!, location.lng!]} icon={mapPinIcon}>
          <Popup>
            <div style={{ minWidth: 150 }}>
              <strong>{index + 1}. {location.name || "Location"}</strong>
              <div>{location.address}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function MapEditor({ value, onSave }: { value: MapInfo; onSave: (v: MapInfo) => void }) {
  const initial = value as MultiMapInfo;
  const [draft, setDraft] = useState<MultiMapInfo>({
    ...initial,
    locations: Array.isArray(initial.locations) ? initial.locations : [],
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const updateLocation = (id: string, changes: Partial<MapLocation>) => {
    setDraft((current) => ({
      ...current,
      locations: (current.locations ?? []).map((location) => location.id === id ? { ...location, ...changes } : location),
    }));
  };

  const addLocation = () => {
    setDraft((current) => ({
      ...current,
      locations: [...(current.locations ?? []), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: "", address: "" }],
    }));
  };

  const removeLocation = (id: string) => {
    setDraft((current) => ({ ...current, locations: (current.locations ?? []).filter((location) => location.id !== id) }));
  };

  const saveMap = async () => {
    setSaveError("");
    const locations = (draft.locations ?? []).map((location) => ({
      ...location,
      name: location.name.trim(),
      address: location.address.trim(),
    }));
    if (locations.some((location) => !location.name || !location.address)) {
      setSaveError("Enter both a location name and address for every location, or remove the empty row.");
      return;
    }
    setIsSaving(true);
    try {
      // Resolve addresses to coordinates so each location can be displayed as a map pin.
      // Coordinates already saved are retained to avoid unnecessary geocoding requests.
      const geocoded: MapLocation[] = [];
      for (const location of locations) {
        if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
          geocoded.push(location);
          continue;
        }
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location.address)}`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Could not find coordinates for "${location.name}". Check the address and try again.`);
        const results = await response.json();
        if (!Array.isArray(results) || !results[0]) {
          throw new Error(`Could not find "${location.address}". Try a more complete address, including city or province.`);
        }
        geocoded.push({ ...location, lat: Number(results[0].lat), lng: Number(results[0].lon) });
        // Nominatim's public service asks for a maximum of one request per second.
        if (locations.length > 1) await new Promise((resolve) => window.setTimeout(resolve, 1100));
      }
      onSave({ ...draft, locations: geocoded });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save locations. Please check the addresses and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Map locations</div>
          <div className="mt-1 text-xs text-white/50">Add names and addresses. Each saved location appears as a pin on the map.</div>
        </div>
        <Button type="button" variant="outline" className="border-cyan-300/40 bg-transparent text-cyan-200 hover:bg-cyan-300/10" onClick={addLocation}>
          <MapPinned className="mr-2 h-4 w-4" /> Add location
        </Button>
      </div>

      {(draft.locations ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/20 p-4 text-sm text-white/50">No locations added yet. Select “Add location” to create your first pin.</div>
      ) : null}

      {(draft.locations ?? []).map((location, index) => (
        <div key={location.id} className="grid gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-cyan-200">Location {index + 1}</div>
            <Button type="button" variant="ghost" size="sm" className="text-red-300 hover:bg-red-400/10 hover:text-red-200" onClick={() => removeLocation(location.id)}>
              <LogOut className="mr-2 h-4 w-4 rotate-180" /> Remove
            </Button>
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-white/60">LOCATION NAME</label>
            <Input value={location.name} onChange={(event) => updateLocation(location.id, { name: event.target.value })} placeholder="e.g. Main Gymnasium" className="border-white/15 bg-black/30 text-white" />
          </div>
          <div className="grid gap-2">
            <label className="text-xs text-white/60">FULL ADDRESS</label>
            <Input value={location.address} onChange={(event) => updateLocation(location.id, { address: event.target.value, lat: undefined, lng: undefined })} placeholder="Street, barangay, city, province" className="border-white/15 bg-black/30 text-white" />
          </div>
          {Number.isFinite(location.lat) && Number.isFinite(location.lng) ? <div className="text-xs text-emerald-200/70">Coordinates found: {location.lat!.toFixed(5)}, {location.lng!.toFixed(5)}</div> : null}
        </div>
      ))}

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">MAP NOTES (OPTIONAL)</label>
        <Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} className="min-h-[80px] border-white/15 bg-black/30 text-white" placeholder="Directions or general map information" />
      </div>
      {saveError ? <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{saveError}</div> : null}
      <div className="flex justify-end">
        <Button className="bg-cyan-300 text-black hover:bg-cyan-200" onClick={saveMap} disabled={isSaving}>
          {isSaving ? "Finding locations…" : "Save locations"}
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-white/40">Addresses are converted to map coordinates using OpenStreetMap's public geocoding service. For frequent/high-volume use, configure a dedicated geocoding provider.</p>
    </div>
  );
}

function BracketEditor({
  value,
  sports,
  onSave,
}: {
  value?: Bracket;
  sports: string[];
  onSave: (b: Bracket) => void;
}) {
  const [sport, setSport] = useState<Sport>(value?.sport ?? sports[0] ?? "Basketball");
  const [format, setFormat] = useState<"single" | "double">((value as any)?.format ?? "single");
  const [name, setName] = useState(value?.name ?? "");
  const [teamsText, setTeamsText] = useState(
    (value?.teams ?? []).join("\n") || "Team A\nTeam B"
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">SPORT</label>
        <Select value={sport} onValueChange={(v) => setSport(v as Sport)}>
          <SelectTrigger className="bg-black/30 border-white/15 text-white">
            <SelectValue placeholder="Select sport" />
          </SelectTrigger>
          <SelectContent>
            {sports.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">FORMAT</label>
        <Select value={format} onValueChange={(v) => setFormat(v as any)}>
          <SelectTrigger className="bg-black/30 border-white/15 text-white">
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single elimination</SelectItem>
            <SelectItem value="double">Double elimination</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-white/35">
          Single elimination is fully supported. Double elimination is a preview (structure only).
        </div>
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">BRACKET NAME</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-black/30 border-white/15 text-white"
          placeholder="e.g., Men's Division"
        />
      </div>

      <div className="grid gap-2">
        <label className="text-xs tracking-[0.18em] text-white/60">TEAMS (ONE PER LINE)</label>
        <Textarea
          value={teamsText}
          onChange={(e) => setTeamsText(e.target.value)}
          className="min-h-[140px] bg-black/30 border-white/15 text-white"
        />
      </div>

      <div className="flex justify-end">
        <Button
          className="bg-cyan-300 text-black hover:bg-cyan-200"
          onClick={() => {
            const teams = teamsText
              .split("\n")
              .map((t) => t.trim())
              .filter(Boolean);
            if (!name.trim()) {
              toast.error("Bracket name is required");
              return;
            }
            if (teams.length < 2) {
              toast.error("Add at least 2 teams");
              return;
            }
            const rounds = buildSingleElimRounds(teams);
            const extras = format === "double" ? buildDoubleElimExtras(teams) : null;
            onSave({
              id: value?.id ?? nanoId(),
              sport,
              name: name.trim(),
              format,
              teams,
              rounds,
              ...(extras ? { losersRounds: extras.losersRounds, grandFinal: extras.grandFinal } : {}),
            });
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}


/**
 * Rebuild winner propagation through every round of a single-elimination bracket.
 * This keeps semifinal/final team slots in sync after scores or manual advances
 * are changed, and clears stale downstream winners when an upstream team changes.
 */
function propagateBracketRounds(rounds: any[], mode: "auto" | "manual") {
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    const round = rounds[roundIndex];
    if (!round?.matches) continue;

    // Decide the winner for each match before advancing winners to the next round.
    for (const match of round.matches) {
      const hasA = Boolean(match.a?.team);
      const hasB = Boolean(match.b?.team);

      // Do not auto-advance a partially populated semifinal/final: the other
      // quarter-final may simply not have been decided yet. A match only has
      // a winner once both slots have teams, then Auto/Manual mode applies.
      if (!hasA || !hasB) {
        match.winner = undefined;
      } else if (mode === "auto") {
        const scoreA = match.a.score;
        const scoreB = match.b.score;
        const validScores = scoreA !== null && scoreA !== undefined && scoreA !== "" &&
          scoreB !== null && scoreB !== undefined && scoreB !== "" &&
          Number.isFinite(Number(scoreA)) && Number.isFinite(Number(scoreB));

        // In automatic mode, require two valid, non-tied scores.
        if (!validScores || Number(scoreA) === Number(scoreB)) {
          match.winner = undefined;
        } else {
          match.winner = Number(scoreA) > Number(scoreB) ? "a" : "b";
        }
      } else if (match.winner !== "a" && match.winner !== "b") {
        match.winner = undefined;
      }
    }

    const nextRound = rounds[roundIndex + 1];
    if (!nextRound?.matches) continue;

    // Each pair of matches feeds the next match: first match -> side A,
    // second match -> side B. This repeats for semifinal -> final as well.
    round.matches.forEach((match: any, matchIndex: number) => {
      const nextMatch = nextRound.matches[Math.floor(matchIndex / 2)];
      if (!nextMatch) return;

      const destinationSide = matchIndex % 2 === 0 ? "a" : "b";
      const advancedTeam = match.winner ? (match[match.winner]?.team ?? undefined) : undefined;
      const destination = nextMatch[destinationSide];

      // If the incoming team changed, the old semifinal/final score and winner
      // are no longer valid, so clear them before continuing to later rounds.
      if (destination.team !== advancedTeam) {
        destination.team = advancedTeam;
        destination.score = null;
        nextMatch.winner = undefined;
      }
    });
  }
}


export default function Dashboard() {
  const [, navigate] = useLocation();
  const session = useMemo(() => getSession(), []);
  const isAdmin = session.role === "admin";
  const isViewer = session.role === "viewer";
  const isGuest = session.role === "guest";
  const role = session.role;
  const isReadOnly = isViewer || isGuest;

  const [store, setStore] = useState(() => loadStore());
  const [bracketSportFilter, setBracketSportFilter] = useState<"ALL" | string>("ALL");
  const [scheduleSportFilter, setScheduleSportFilter] = useState<"ALL" | string>("ALL");
  const [leaderboardSportFilter, setLeaderboardSportFilter] = useState<"Overall" | string>("Overall");
  const [tab, setTab] = useState<string>("news");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [viewerTutorialEnabled, setViewerTutorialEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("rcess-viewer-tour-enabled") !== "false";
    } catch {
      return true;
    }
  });
  const [viewerTourOpen, setViewerTourOpen] = useState(false);
  const [viewerTourStep, setViewerTourStep] = useState(0);
  const [viewerTourRect, setViewerTourRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
    tipTop: number;
    tipLeft: number;
  } | null>(null);

  const viewerTourSteps = useMemo(() => [
    { target: "navigation", tab: "news", title: "Portal Navigation", description: "Use the navigation to move through News, Emergency Hotline, Leaderboard, Bracketing, Match Schedule, Map, and Evaluation. On Android or a small screen, these sections are inside the Menu. I’ll highlight each section in the next steps." },
    { target: "news", tab: "news", title: "News and Announcements", description: "Read the latest announcements, updates, and reminders here. Viewer accounts can read posts but cannot edit or delete them." },
    { target: "summit", tab: "summit", title: "Emergency Hotline", description: "Find emergency service contacts here. Tap a phone number to call it when your device supports phone links. Scroll down if there are multiple hotline contacts." },
    { target: "leaderboard", tab: "leaderboard", title: "Leaderboard", description: "Check team standings and points. Use the score-view dropdown to switch between the overall leaderboard and individual sports." },
    { target: "bracketing", tab: "bracketing", title: "Bracketing", description: "Follow the tournament bracket and see how teams progress through the rounds. Available details depend on the tournament setup." },
    { target: "schedule", tab: "schedule", title: "Match Schedule", description: "Review match times, locations, sports, and current statuses. Use the sport filter to find relevant matches." },
    { target: "map", tab: "map", title: "Map", description: "View the venue or location information provided by the organizers. You can use the embedded map to explore the location." },
    { target: "evaluation", tab: "evaluation", title: "Evaluation", description: "This section is reserved for evaluation tools and information. It may show limited content if the feature has not been enabled yet." },
  ], []);

  // Keep the mobile navigation drawer pinned open during every tutorial step
  // after the intro. The intro (step 0) intentionally highlights the closed Menu button.
  const mobileTutorialMenuMustStayOpen =
    viewerTourOpen &&
    viewerTourStep > 0 &&
    typeof window !== "undefined" &&
    window.innerWidth < 1024;

  const canEditSettings = store.settings.permissions.settingsEditors.includes(role);
  const canEditNews = store.settings.permissions.newsEditors.includes(role);
  const canEditSummit = store.settings.permissions.summitEditors.includes(role);
  const canEditLeaderboard = store.settings.permissions.leaderboardEditors.includes(role);
  const canEditBrackets = store.settings.permissions.bracketEditors.includes(role);
  const canEditSchedule = store.settings.permissions.scheduleEditors.includes(role);
  const canEditMap = store.settings.permissions.mapEditors.includes(role);
  const bracketAutoAdvance = store.settings.bracketAutoAdvance;

  const navItems = useMemo(() => {
    const base = [
      { k: "news", t: "News" },
      { k: "summit", t: "Emergency Hotline" },
      { k: "leaderboard", t: "Leaderboard" },
      { k: "bracketing", t: "Bracketing" },
      { k: "schedule", t: "Match Schedule" },
      { k: "map", t: "Map" },
      { k: "evaluation", t: "Evaluation" },
    ];
    if (isAdmin) base.push({ k: "settings", t: "Settings" });
    if (role === "guest") return base.filter((i) => i.k === "news" || i.k === "leaderboard");
    return base;
  }, [isAdmin, role]);

  const desktopTabs = useMemo(() => {
    const base = [
      { k: "news", t: "News", icon: Newspaper },
      { k: "summit", t: "Emergency Hotline", icon: PhoneCall },
      { k: "leaderboard", t: "Leaderboard", icon: Trophy },
      { k: "bracketing", t: "Bracketing", icon: Trophy },
      { k: "schedule", t: "Match Schedule", icon: CalendarCheck },
      { k: "map", t: "Map", icon: MapPinned },
      { k: "evaluation", t: "Evaluation", icon: ClipboardList },
      ...(isAdmin ? [{ k: "settings", t: "Settings", icon: Settings }] : []),
    ] as Array<{ k: string; t: string; icon: any }>;

    if (role === "guest") return base.filter((i) => i.k === "news" || i.k === "leaderboard");
    return base;
  }, [isAdmin, role]);

  useEffect(() => {
    // If not logged in at all, send to login
    if (session.role === "guest" && !session.email) navigate("/login");
  }, [navigate, session.email, session.role]);

  useEffect(() => {
    // Clamp current tab to what this role is allowed to see
    if (!navItems.some((i) => i.k === tab)) {
      setTab(navItems[0]?.k ?? "news");
    }
  }, [navItems, tab]);

  // Automatically guide viewers on first visit only when the admin has enabled it.
  // The enabled/disabled switch is stored in this browser's local storage.
  useEffect(() => {
    if (!isViewer || !session.email || !viewerTutorialEnabled) return;
    const completedKey = `rcess-viewer-tour-complete:${(session.email ?? "viewer").toLowerCase()}`;
    try {
      if (window.localStorage.getItem(completedKey) !== "true") {
        setTab("news");
        setViewerTourStep(0);
        setViewerTourOpen(true);
      }
    } catch {
      // If localStorage is unavailable, still show the tour for this session.
      setTab("news");
      setViewerTourStep(0);
      setViewerTourOpen(true);
    }
  }, [isViewer, session.email, viewerTutorialEnabled]);

  // Keep the tour focus around navigation as the tour changes tabs.
  // The first mobile step highlights the Menu dropdown; later mobile steps open
  // the drawer and highlight the matching menu item. Desktop highlights the tabs.
  useEffect(() => {
    if (!viewerTourOpen) {
      setViewerTourRect(null);
      return;
    }

    const step = viewerTourSteps[viewerTourStep];
    if (!step) return;
    setTab(step.tab);

    const isMobileViewport = window.innerWidth < 1024;
    // On mobile, the first guide highlights the closed Menu dropdown itself.
    // Later steps open the drawer so each matching menu item can be highlighted.
    const isMobileDropdownIntro = isMobileViewport && step.target === "navigation";
    setMobileNavOpen(isMobileViewport && !isMobileDropdownIntro);

    const timer = window.setTimeout(() => {
      const navigationKeys = ["news", "summit", "leaderboard", "bracketing", "schedule", "map", "evaluation"];
      // On desktop, the intro highlights the whole horizontal navigation.
      // On mobile, it highlights only the Menu dropdown button.
      const isNavigationRange = step.target === "navigation" && !isMobileViewport;
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      };

      const desktopNavigationTargets = isNavigationRange
        ? navigationKeys
            .map((key) => document.querySelector(`[role="tab"][data-tour-target="${key}"]`) as HTMLElement | null)
            .filter((element): element is HTMLElement => Boolean(element && visible(element)))
        : [];
      const mobileNavigationTargets = isNavigationRange
        ? Array.from(document.querySelectorAll('[data-tour-nav-item="true"]')) as HTMLElement[]
        : [];
      const navigationTargets = desktopNavigationTargets.length > 0
        ? desktopNavigationTargets
        : mobileNavigationTargets.filter(visible);

      // On mobile, prioritize the matching item inside the opened Menu drawer.
      // The section heading is only a fallback if the navigation target is unavailable.
      const mobileDropdownTarget = isMobileDropdownIntro
        ? document.querySelector('[data-tour-target="mobile-menu-toggle"]') as HTMLElement | null
        : null;
      const mobileStepTarget = isMobileViewport && !isMobileDropdownIntro
        ? document.querySelector(`[data-tour-nav-item="true"][data-tour-target="${step.target}"]`) as HTMLElement | null
        : null;
      const candidates = isNavigationRange && navigationTargets.length > 0
        ? navigationTargets
        : mobileDropdownTarget && visible(mobileDropdownTarget)
          ? [mobileDropdownTarget]
          : mobileStepTarget && visible(mobileStepTarget)
            ? [mobileStepTarget]
            : Array.from(document.querySelectorAll(`[data-tour-target="${isNavigationRange ? "news" : step.target}"]`)) as HTMLElement[];
      const target = candidates.find(visible) ?? null;
      if (!target) {
        setViewerTourRect(null);
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      window.setTimeout(() => {
        const rects = isNavigationRange && navigationTargets.length > 0
          ? navigationTargets.map((element) => element.getBoundingClientRect())
          : [target.getBoundingClientRect()];
        const bounds = {
          top: Math.min(...rects.map((rect) => rect.top)),
          left: Math.min(...rects.map((rect) => rect.left)),
          right: Math.max(...rects.map((rect) => rect.right)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
        };
        const margin = 16;
        const isSmallScreen = window.innerWidth < 640;
        const tipWidth = Math.min(isSmallScreen ? 300 : 360, window.innerWidth - margin * 2);
        const tipHeight = isSmallScreen ? Math.min(230, window.innerHeight - margin * 2) : 245;
        const tipLeft = Math.max(margin, Math.min(bounds.left, window.innerWidth - tipWidth - margin));
        let tipTop = bounds.bottom + 16;
        if (tipTop + tipHeight > window.innerHeight - margin) {
          tipTop = bounds.top - tipHeight - 16;
        }
        tipTop = Math.max(margin, Math.min(tipTop, window.innerHeight - tipHeight - margin));
        setViewerTourRect({
          top: Math.max(4, bounds.top - 8),
          left: Math.max(4, bounds.left - 8),
          width: Math.min(window.innerWidth - 8, bounds.right - bounds.left + 16),
          height: bounds.bottom - bounds.top + 16,
          tipTop,
          tipLeft,
        });
      }, 220);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [viewerTourOpen, viewerTourStep, viewerTourSteps]);

  // Advance the tutorial itself; viewers do not need to tap the highlighted
  // navigation item. On mobile, open the Menu drawer for each section step and
  // close it again when returning to the introductory Menu-button step.
  function moveViewerTourToStep(nextStepIndex: number) {
    const nextStep = viewerTourSteps[nextStepIndex];
    if (!nextStep) return;
    setViewerTourStep(nextStepIndex);
    setTab(nextStep.tab);
    const isMobileViewport = window.innerWidth < 1024;
    setMobileNavOpen(isMobileViewport && nextStep.target !== "navigation");
  }

  function commit(next: typeof store) {
    setStore(next);
    saveStore(next);
  }

  function commitIfAdmin(next: typeof store) {
    if (!isAdmin) {
      toast("Admin only");
      return;
    }
    commit(next);
  }

  function commitIfSettingsAllowed(next: typeof store) {
    if (!canEditSettings) {
      toast("No permission to edit Settings");
      return;
    }
    commit(next);
  }

  function commitIfNewsAllowed(next: typeof store) {
    if (!canEditNews) {
      toast("No permission to edit News");
      return;
    }
    commit(next);
  }

  function commitIfSummitAllowed(next: typeof store) {
    if (!canEditSummit) {
      toast("No permission to edit Emergency Hotline");
      return;
    }
    commit(next);
  }

  function commitIfLeaderboardAllowed(next: typeof store) {
    if (!canEditLeaderboard) {
      toast("No permission to edit Leaderboard");
      return;
    }
    commit(next);
  }

  function commitIfBracketsAllowed(next: typeof store) {
    if (!canEditBrackets) {
      toast("No permission to edit Bracketing");
      return;
    }
    commit(next);
  }

  function commitIfScheduleAllowed(next: typeof store) {
    if (!canEditSchedule) {
      toast("No permission to edit Match Schedule");
      return;
    }
    commit(next);
  }

  function commitIfMapAllowed(next: typeof store) {
    if (!canEditMap) {
      toast("No permission to edit Map");
      return;
    }
    commit(next);
  }

  // Update a score by bracket and match ID rather than relying on a rendered
  // bracket's captured array indexes. This keeps scoring independent for every
  // bracket when multiple brackets are displayed on the same page.
  function updateBracketScore(
    bracketId: string,
    roundIndex: number,
    matchId: string,
    sideKey: "a" | "b",
    rawValue: string,
  ) {
    if (!canEditBrackets) {
      toast("No permission to edit Bracketing");
      return;
    }

    const parsedScore = rawValue.trim() === "" ? null : Number(rawValue);
    const score = parsedScore !== null && Number.isFinite(parsedScore) ? parsedScore : null;

    const nextBrackets = store.brackets.map((bracket) => {
      if (bracket.id !== bracketId) return bracket;

      const rounds = bracket.rounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) => ({
          ...match,
          a: { ...match.a },
          b: { ...match.b },
        })),
      }));
      const round = rounds[roundIndex];
      const match = round?.matches.find((candidate) => candidate.id === matchId);
      if (!match) return bracket;

      match[sideKey].score = score;
      propagateBracketRounds(rounds, bracketAutoAdvance ? "auto" : "manual");
      return { ...bracket, rounds };
    });

    commitIfBracketsAllowed({ ...store, brackets: nextBrackets });
  }

  const latestNews = store.news[0];
  // Keep older saved data working while allowing multiple Emergency Hotline entries.
  const summitItems: (SummitInfo & { id: string })[] =
    ((store as any).summits as (SummitInfo & { id: string })[] | undefined) ??
    (store.summit ? [{ ...store.summit, id: "legacy-summit" }] : []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030530] text-white">
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[#030530]"
        aria-hidden="true"
      />
      <div className="rcess-grid pointer-events-none" aria-hidden="true" />
      <div className="rcess-vignette pointer-events-none" aria-hidden="true" />
      <div className="rcess-scanlines pointer-events-none" aria-hidden="true" />
      <div className="rcess-cornerglow pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-3 sm:px-5 md:px-8 lg:px-10 py-8 sm:py-10 md:py-12">
        {/* Desktop logout: upper-right */}
        <div className="hidden lg:flex items-center justify-end mb-3">
          <Button
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => {
              clearSession();
              navigate("/");
            }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>

        <PortalHeader />

        <div className="mt-8 md:mt-10">
          <Card className="rcess-panel p-0 w-full min-h-[70vh]">
            <div className="p-6 sm:p-7 md:p-9 lg:p-10">
              <div className="text-[11px] tracking-[0.45em] text-white/45">TAB SECTION</div>
              <div className="mt-2 text-2xl font-semibold">
                {(
                  {
                    news: "News Dashboard",
                    summit: "Emergency Hotline",
                    leaderboard: "Leaderboard",
                    bracketing: "Bracketing",
                    schedule: "Match Schedule",
                    map: "Map",
                    evaluation: "Evaluation",
                    settings: "Settings",
                  } as Record<string, string>
                )[tab] ?? "Dashboard"}
              </div>
              {!isAdmin ? (
                <div className="mt-2 text-sm text-white/55">
                  You are viewing in <span className="text-white/75">read-only</span> mode for some sections.
                </div>
              ) : null}

              <Tabs value={tab} onValueChange={setTab} className="mt-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  {/* Desktop tabs */}
                  <TabsList className="hidden lg:flex bg-black/25 border border-white/10 p-1 rounded-xl w-full max-w-full overflow-x-auto justify-start">
                    {desktopTabs.map((t) => {
                      const Icon = t.icon;
                      return (
                        <TabsTrigger
                          key={t.k}
                          value={t.k}
                          data-tour-target={(["news", "summit", "leaderboard", "bracketing", "schedule", "map", "evaluation"] as string[]).includes(t.k) ? t.k : undefined}
                          className="gap-2 data-[state=active]:bg-white/10 shrink-0"
                        >
                          <Icon className="h-4 w-4" /> {t.t}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Mobile dropdown navigation (upper-left) */}
                    <Sheet
                      // Pin the drawer open from the News step through the end of the
                      // mobile tutorial, even if the drawer attempts to close itself.
                      open={mobileNavOpen || mobileTutorialMenuMustStayOpen}
                      onOpenChange={(open) => {
                        if (!open && mobileTutorialMenuMustStayOpen) return;
                        // Don't allow the drawer to close during mobile tutorial mode.
                        // Skip/Finish and going back to the intro close it explicitly.
                        if (!open && viewerTourOpen && mobileNavOpen) return;
                        setMobileNavOpen(open);
                      }}
                    >
                      <SheetTrigger asChild>
                        <Button
                          variant="outline"
                          className="lg:hidden border-white/20 bg-transparent text-white hover:bg-white/10"
                          aria-label="Open menu"
                          data-tour-target="mobile-menu-toggle"
                        >
                          <span className="max-w-[180px] truncate">
                            Menu
                          </span>
                          <ChevronDown className="ml-2 h-4 w-4" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="left" className="bg-black/90 border-white/15 text-white w-[320px]">
                        <SheetHeader>
                          <SheetTitle className="text-white">Menu</SheetTitle>
                        </SheetHeader>
                        <div className="mt-4">
                          <Command className="bg-transparent">
                            <CommandInput placeholder="Search menu..." className="text-white" />
                            <CommandList>
                              <CommandEmpty>No results.</CommandEmpty>
                              <CommandGroup heading="Jump to">
                                {navItems.map((i) => (
                                    <CommandItem
                                      key={i.k}
                                      value={i.t}
                                      data-tour-target={(["news", "summit", "leaderboard", "bracketing", "schedule", "map", "evaluation"] as string[]).includes(i.k) ? i.k : undefined}
                                      data-tour-nav-item={(["news", "summit", "leaderboard", "bracketing", "schedule", "map", "evaluation"] as string[]).includes(i.k) ? "true" : undefined}
                                      onSelect={() => {
                                        setTab(i.k);
                                        // Don't collapse the dropdown when a viewer is
                                        // following the tutorial; Next/Back controls the tour.
                                        if (!viewerTourOpen) setMobileNavOpen(false);
                                      }}
                                      className="text-white aria-selected:bg-white/10"
                                    >
                                      {i.t}
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                              <CommandGroup heading="Account">
                                <CommandItem
                                  value="Logout"
                                  onSelect={() => {
                                    clearSession();
                                    navigate("/");
                                  }}
                                  className="text-white aria-selected:bg-white/10"
                                >
                                  Logout
                                </CommandItem>
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </div>
                      </SheetContent>
                    </Sheet>

                    <Badge className="bg-white/10 text-white border border-white/15 hover:bg-white/10">Portal</Badge>

                    {/* Desktop logout removed from here */}
                  </div>
                </div>

                {/* NEWS */}
                <TabsContent value="news" className="mt-5">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">News and Announcements</div>
                        <div className="mt-1 text-sm text-white/50">{store.news.length} {store.news.length === 1 ? "post" : "posts"}</div>
                      </div>
                      {!isReadOnly ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button className="bg-cyan-300 text-black hover:bg-cyan-200" disabled={!canEditNews} title={!canEditNews ? "No permission" : undefined}>
                              Add news
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-black/80 border-white/15 text-white">
                            <DialogHeader><DialogTitle>Add news</DialogTitle></DialogHeader>
                            <NewsEditor onSave={(item) => {
                              commitIfNewsAllowed({ ...store, news: [item, ...store.news] });
                              toast.success("News saved");
                            }} />
                          </DialogContent>
                        </Dialog>
                      ) : null}
                    </div>

                    {store.news.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/50">No news yet.</div>
                    ) : (
                      store.news.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="text-lg font-semibold break-words">{item.title}</div>
                              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/60">{item.body}</div>
                              <div className="mt-4 text-xs text-white/40">Posted: {formatPosted(item.postedAtIso)}</div>
                            </div>
                            <Badge className="w-fit bg-white text-black hover:bg-white">{item.type}</Badge>
                          </div>
                          {!isReadOnly ? (
                            <div className="mt-4">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" disabled={!canEditNews} title={!canEditNews ? "No permission" : undefined}>Edit news</Button>
                                </DialogTrigger>
                                <DialogContent className="bg-black/80 border-white/15 text-white">
                                  <DialogHeader><DialogTitle>Edit news</DialogTitle></DialogHeader>
                                  <NewsEditor item={item} onSave={(next) => {
                                    commitIfNewsAllowed({ ...store, news: store.news.map((n) => n.id === next.id ? next : n) });
                                    toast.success("News updated");
                                  }} onDelete={(newsItem) => {
                                    commitIfNewsAllowed({ ...store, news: store.news.filter((n) => n.id !== newsItem.id) });
                                    toast.success("News deleted");
                                  }} />
                                </DialogContent>
                              </Dialog>
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                {/* EMERGENCY HOTLINE */}
                <TabsContent value="summit" className="mt-5">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div data-tour-target="summit" className="text-lg font-semibold">Emergency Hotline</div>
                        <div className="mt-1 text-sm text-white/50">
                          Emergency contact numbers and service information.
                        </div>
                      </div>
                      {!isReadOnly ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button className="bg-cyan-300 text-black hover:bg-cyan-200" disabled={!canEditSummit} title={!canEditSummit ? "No permission" : undefined}>
                              Add hotline contact
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-black/80 border-white/15 text-white">
                            <DialogHeader><DialogTitle>Add emergency hotline contact</DialogTitle></DialogHeader>
                            <SummitEditor value={{ title: "", subtitle: "", venue: "", dateLabel: "", notes: "" }} onSave={(value) => {
                              const nextItem = { ...value, id: nanoId() };
                              const nextSummits = [nextItem, ...summitItems.filter((x) => x.id !== "legacy-summit")];
                              commitIfSummitAllowed({ ...store, summit: value, summits: nextSummits } as typeof store);
                              toast.success("Emergency hotline contact added");
                            }} />
                          </DialogContent>
                        </Dialog>
                      ) : null}
                    </div>

                    {summitItems.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-white/50">
                        No emergency hotline contacts yet. An administrator can add a contact.
                      </div>
                    ) : (
                      summitItems.map((item) => {
                        const phoneNumber = extractEmergencyPhoneNumber(item);
                        const telNumber = phoneNumber.replace(/[^\d+]/g, "");
                        return (
                          <div key={item.id} className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
                                <PhoneCall className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-lg font-semibold break-words">{item.title || "Emergency Hotline"}</div>
                                {item.subtitle ? <div className="mt-1 text-sm text-white/55">{item.subtitle}</div> : null}
                              </div>
                            </div>
                            <div className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
                              <div className="text-xs tracking-[0.18em] text-white/45">CONTACT NUMBER</div>
                              {phoneNumber ? (
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                  <a href={`tel:${telNumber}`} className="inline-block text-xl font-semibold text-cyan-200 underline decoration-cyan-300/40 underline-offset-4 hover:text-cyan-100">
                                    {phoneNumber}
                                  </a>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
                                    onClick={async () => {
                                      const copied = await copyTextToClipboard(phoneNumber);
                                      if (copied) toast.success("Contact number copied");
                                      else toast.error("Could not copy the contact number. Please select and copy it manually.");
                                    }}
                                  >
                                    <Copy className="mr-2 h-4 w-4" /> Copy number
                                  </Button>
                                </div>
                              ) : (
                                <div className="mt-1 text-sm text-white/55">
                                  No contact number was found in the saved Emergency Hotline details. An admin can enter the number using Edit hotline contact.
                                </div>
                              )}
                            </div>
                            {item.dateLabel ? (
                              <div className="mt-3 text-sm text-white/60">
                                <span className="text-white/45">Availability:</span> {item.dateLabel}
                              </div>
                            ) : null}
                            {item.notes ? <div className="mt-3 whitespace-pre-wrap text-sm text-white/55">{item.notes}</div> : null}
                            {!isReadOnly ? (
                              <div className="mt-5">
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" disabled={!canEditSummit} title={!canEditSummit ? "No permission" : undefined}>
                                      Edit hotline contact
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="bg-black/80 border-white/15 text-white">
                                    <DialogHeader><DialogTitle>Edit emergency hotline contact</DialogTitle></DialogHeader>
                                    <SummitEditor value={item} onSave={(value) => {
                                      const nextSummits = summitItems.map((x) => x.id === item.id ? { ...value, id: item.id } : x);
                                      commitIfSummitAllowed({ ...store, summit: value, summits: nextSummits } as typeof store);
                                      toast.success("Emergency hotline contact updated");
                                    }} onDelete={() => {
                                      const nextSummits = summitItems.filter((x) => x.id !== item.id);
                                      const nextSummit = nextSummits[0] ?? null;
                                      commitIfSummitAllowed({ ...store, summit: nextSummit, summits: nextSummits } as typeof store);
                                      toast.success("Emergency hotline contact deleted");
                                    }} />
                                  </DialogContent>
                                </Dialog>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </TabsContent>

                {/* MATCH SCHEDULE */}
                <TabsContent value="schedule" className="mt-5">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <div data-tour-target="schedule" className="text-lg font-semibold">Match Schedule</div>
                        <div className="mt-1 text-sm text-white/55">
                          News-style feed for games that are <span className="text-white/75">Starting</span> or <span className="text-white/75">In Game</span>.
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <div className="text-xs tracking-[0.18em] text-white/50">SPORT</div>
                          <Select value={scheduleSportFilter} onValueChange={(v) => setScheduleSportFilter(v as any)}>
                            <SelectTrigger className="h-9 w-full sm:w-[220px] bg-black/30 border-white/15 text-white">
                              <SelectValue placeholder="Select sport" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ALL">All sports</SelectItem>
                              {store.settings.sports.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isAdmin ? (
                          <Badge className="bg-white/10 text-white border border-white/15 hover:bg-white/10">Read-only</Badge>
                        ) : null}

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              className="bg-cyan-300 text-black hover:bg-cyan-200"
                              disabled={!canEditMap}
                              title={!canEditMap ? "No permission" : undefined}
                            >
                              Add schedule
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-black/80 border-white/15 text-white">
                            <DialogHeader>
                              <DialogTitle>Add schedule post</DialogTitle>
                            </DialogHeader>

                            <ScheduleEditor
                              sports={store.settings.sports}
                              onSave={(post) => {
                                commitIfScheduleAllowed({ ...store, schedule: [post, ...(store.schedule ?? [])] });
                                toast.success("Schedule posted");
                              }}
                            />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>

                    {(() => {
                      const items = (store.schedule ?? [])
                        .filter((p) => p.status === 'Starting' || p.status === 'In Game')
                        .filter((p) => scheduleSportFilter === 'ALL' || p.sport === scheduleSportFilter)
                        .slice()
                        .sort((a, b) => new Date(a.timeIso).getTime() - new Date(b.timeIso).getTime());

                      const latest = items[0];
                      const rest = items.slice(1);

                      return (
                        <>
                          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-lg font-semibold">{latest ? latest.title : 'No matches posted'}</div>
                                <div className="mt-2 text-sm text-white/60">
                                  {latest ? (
                                    <>
                                      <span className="text-white/45">Time:</span>{' '}
                                      {new Date(latest.timeIso).toLocaleString()}
                                      {latest.location ? (
                                        <>
                                          {' '}• <span className="text-white/45">Location:</span> {latest.location}
                                        </>
                                      ) : null}
                                      {' '}• <span className="text-white/45">Sport:</span> {latest.sport}
                                    </>
                                  ) : (
                                    'Admins can post games that are Starting or In Game.'
                                  )}
                                </div>
                                {latest ? (
                                  <div className="mt-4 text-xs text-white/40">Posted: {new Date(latest.postedAtIso).toLocaleString()}</div>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-white text-black hover:bg-white">{latest ? latest.status : 'Schedule'}</Badge>
                                {isAdmin && latest ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                    onClick={() => {
                                      commitIfScheduleAllowed({
                                        ...store,
                                        schedule: (store.schedule ?? []).filter((x) => x.id !== latest.id),
                                      });
                                      toast("Schedule removed");
                                    }}
                                  >
                                    Delete
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3">
                            {rest.map((p) => (
                              <div key={p.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold">{p.title}</div>
                                    <div className="mt-1 text-sm text-white/55">
                                      <span className="text-white/45">Time:</span> {new Date(p.timeIso).toLocaleString()}
                                      {p.location ? <> • <span className="text-white/45">Location:</span> {p.location}</> : null}
                                      <> • <span className="text-white/45">Sport:</span> {p.sport}</>
                                    </div>
                                    <div className="mt-2 text-xs text-white/40">Posted: {new Date(p.postedAtIso).toLocaleString()}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-white/10 text-white border border-white/15 hover:bg-white/10">{p.status}</Badge>
                                    {!isReadOnly ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                      disabled={!canEditSchedule}
                                      title={!canEditSchedule ? "No permission" : undefined}
                                      onClick={() => {
                                        commitIfScheduleAllowed({ ...store, schedule: (store.schedule ?? []).filter((x) => x.id !== p.id) });
                                        toast('Schedule removed');
                                      }}
                                    >
                                      Delete
                                    </Button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            ))}

                            {items.length === 0 ? (
                              <div className="text-sm text-white/45">No Starting / In Game matches right now.</div>
                            ) : rest.length === 0 ? (
                              <div className="text-sm text-white/45">No other schedule posts.</div>
                            ) : null}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </TabsContent>

{/* MAP */}
                <TabsContent value="map" className="mt-5">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div data-tour-target="map" className="text-lg font-semibold">Map</div>
                        <div className="mt-2 text-sm text-white/55">Manage multiple named locations and display them together as pins.</div>
                      </div>
                      {!isReadOnly ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              className="bg-cyan-300 text-black hover:bg-cyan-200"
                              disabled={!canEditMap}
                              title={!canEditMap ? "No permission" : undefined}
                            >
                              Edit map
                            </Button>
                          </DialogTrigger>
                        <DialogContent className="bg-black/80 border-white/15 text-white">
                          <DialogHeader>
                            <DialogTitle>Edit map locations</DialogTitle>
                          </DialogHeader>
                          <MapEditor
                            value={store.map}
                            onSave={(v) => {
                              commitIfMapAllowed({ ...store, map: v });
                              toast.success("Map updated");
                            }}
                          />
                        </DialogContent>
                      </Dialog>
                      ) : null}
                    </div>

                    <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      {Array.isArray((store.map as MultiMapInfo).locations) && (store.map as MultiMapInfo).locations!.some((location) => Number.isFinite(location.lat) && Number.isFinite(location.lng)) ? (
                        <MultiLocationMap locations={(store.map as MultiMapInfo).locations!} />
                      ) : store.map.embedUrl ? (
                        <iframe title="Existing Google map" src={store.map.embedUrl} className="h-[300px] sm:h-[420px] w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
                      ) : (
                        <div className="p-6 text-sm text-white/45">No locations added yet. Select “Edit map” to add locations and show them as pins.</div>
                      )}
                    </div>
                    {Array.isArray((store.map as MultiMapInfo).locations) && (store.map as MultiMapInfo).locations!.length > 0 ? (
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {(store.map as MultiMapInfo).locations!.map((location, index) => (
                          <div key={location.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="text-sm font-medium text-white">{index + 1}. {location.name}</div>
                            <div className="mt-1 text-xs text-white/50">{location.address}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {store.map.notes ? <div className="mt-3 text-xs text-white/40">{store.map.notes}</div> : null}
                  </div>
                </TabsContent>

                {/* LEADERBOARD */}
                <TabsContent value="leaderboard" className="mt-5">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                    {(() => {
                      const leaderboardCategories = ["Overall", ...store.settings.sports];
                      const activeLeaderboardRows = store.leaderboard
                        .filter((row) => (row.sport ?? "Overall") === leaderboardSportFilter)
                        .slice()
                        .sort((a, b) => b.points - a.points);

                      return (
                        <>
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            <div>
                              <div data-tour-target="leaderboard" className="text-lg font-semibold">Leaderboard</div>
                              <div className="mt-1 text-sm text-white/55">
                                Switch between the <span className="text-white/75">Overall</span> scoreboard and each sport scoreboard.
                              </div>

                              <div className="mt-4 flex flex-wrap items-center gap-3">
                                <div className="text-xs tracking-[0.18em] text-white/50">SCORE VIEW</div>
                                <Select value={leaderboardSportFilter} onValueChange={(v) => setLeaderboardSportFilter(v as any)}>
                                  <SelectTrigger className="h-9 w-full sm:w-[240px] bg-black/30 border-white/15 text-white">
                                    <SelectValue placeholder="Select score view" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {leaderboardCategories.map((category) => (
                                      <SelectItem key={category} value={category}>
                                        {category === "Overall" ? "Overall score" : `${category} score`}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <Dialog>
                              <DialogTrigger asChild>
                                {!isReadOnly ? (
                                  <Button
                                    className="bg-cyan-300 text-black hover:bg-cyan-200"
                                    disabled={!canEditLeaderboard}
                                    title={!canEditLeaderboard ? "No permission" : undefined}
                                  >
                                    Add row
                                  </Button>
                                ) : null}
                              </DialogTrigger>
                              <DialogContent className="bg-black/80 border-white/15 text-white">
                                <DialogHeader>
                                  <DialogTitle>Add leaderboard row</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4">
                                  <div className="grid gap-2">
                                    <label className="text-xs tracking-[0.18em] text-white/60">SCORE VIEW</label>
                                    <select
                                      id="lb-sport"
                                      defaultValue={leaderboardSportFilter}
                                      className="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white"
                                    >
                                      {leaderboardCategories.map((category) => (
                                        <option key={category} value={category} className="bg-black text-white">
                                          {category === "Overall" ? "Overall score" : `${category} score`}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="grid gap-2">
                                    <label className="text-xs tracking-[0.18em] text-white/60">TEAM</label>
                                    <Input id="lb-team" className="bg-black/30 border-white/15 text-white" placeholder="Team name" />
                                  </div>
                                  <div className="grid gap-2">
                                    <label className="text-xs tracking-[0.18em] text-white/60">POINTS</label>
                                    <Input id="lb-points" type="number" className="bg-black/30 border-white/15 text-white" placeholder="0" />
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      className="bg-cyan-300 text-black hover:bg-cyan-200"
                                      onClick={() => {
                                        if (!canEditLeaderboard) return;
                                        const sportEl = document.getElementById('lb-sport') as HTMLSelectElement | null;
                                        const teamEl = document.getElementById('lb-team') as HTMLInputElement | null;
                                        const ptsEl = document.getElementById('lb-points') as HTMLInputElement | null;
                                        const sport = (sportEl?.value ?? leaderboardSportFilter) || "Overall";
                                        const team = (teamEl?.value ?? '').trim();
                                        const points = Number(ptsEl?.value ?? 0);
                                        if (!team) {
                                          toast.error('Team is required');
                                          return;
                                        }
                                        commitIfLeaderboardAllowed({
                                          ...store,
                                          leaderboard: [
                                            ...store.leaderboard,
                                            { id: nanoId(), team, points: Number.isFinite(points) ? points : 0, sport },
                                          ],
                                        });
                                        setLeaderboardSportFilter(sport);
                                        toast.success('Leaderboard row added');
                                      }}
                                    >
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>

                          <div className="mt-5 grid gap-2">
                            {activeLeaderboardRows.map((row, idx) => (
                              <div
                                key={row.id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-10 text-sm font-semibold">#{idx + 1}</div>
                                  <div>
                                    <div className="text-sm font-medium">{row.team}</div>
                                    <div className="text-xs text-white/45">
                                      Points: {row.points} • {row.sport === "Overall" ? "Overall score" : `${row.sport} score`}
                                    </div>
                                  </div>
                                </div>

                                {!isReadOnly ? (
                                  <div className="flex items-center gap-2">
                                    <Dialog>
                                      <DialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                          disabled={!canEditLeaderboard}
                                          title={!canEditLeaderboard ? "No permission" : undefined}
                                        >
                                          Edit
                                        </Button>
                                      </DialogTrigger>
                                      <DialogContent className="bg-black/80 border-white/15 text-white">
                                        <DialogHeader>
                                          <DialogTitle>Edit leaderboard row</DialogTitle>
                                        </DialogHeader>
                                        <div className="grid gap-4">
                                          <div className="grid gap-2">
                                            <label className="text-xs tracking-[0.18em] text-white/60">SCORE VIEW</label>
                                            <select
                                              id={`lb-sport-${row.id}`}
                                              defaultValue={row.sport ?? "Overall"}
                                              className="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white"
                                            >
                                              {leaderboardCategories.map((category) => (
                                                <option key={category} value={category} className="bg-black text-white">
                                                  {category === "Overall" ? "Overall score" : `${category} score`}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                          <div className="grid gap-2">
                                            <label className="text-xs tracking-[0.18em] text-white/60">TEAM</label>
                                            <Input
                                              defaultValue={row.team}
                                              id={`lb-team-${row.id}`}
                                              className="bg-black/30 border-white/15 text-white"
                                            />
                                          </div>
                                          <div className="grid gap-2">
                                            <label className="text-xs tracking-[0.18em] text-white/60">POINTS</label>
                                            <Input
                                              defaultValue={row.points}
                                              id={`lb-points-${row.id}`}
                                              type="number"
                                              className="bg-black/30 border-white/15 text-white"
                                            />
                                          </div>
                                          <div className="flex justify-end">
                                            <Button
                                              className="bg-cyan-300 text-black hover:bg-cyan-200"
                                              onClick={() => {
                                                if (!canEditLeaderboard) return;
                                                const sportEl = document.getElementById(`lb-sport-${row.id}`) as HTMLSelectElement | null;
                                                const teamEl = document.getElementById(`lb-team-${row.id}`) as HTMLInputElement | null;
                                                const ptsEl = document.getElementById(`lb-points-${row.id}`) as HTMLInputElement | null;
                                                const sport = (sportEl?.value ?? row.sport ?? "Overall") || "Overall";
                                                const team = (teamEl?.value ?? '').trim();
                                                const points = Number(ptsEl?.value ?? 0);
                                                if (!team) {
                                                  toast.error('Team is required');
                                                  return;
                                                }
                                                commitIfLeaderboardAllowed({
                                                  ...store,
                                                  leaderboard: store.leaderboard.map((x) =>
                                                    x.id === row.id
                                                      ? { ...x, team, points: Number.isFinite(points) ? points : 0, sport }
                                                      : x
                                                  ),
                                                });
                                                setLeaderboardSportFilter(sport);
                                                toast.success('Leaderboard updated');
                                              }}
                                            >
                                              Save
                                            </Button>
                                          </div>
                                        </div>
                                      </DialogContent>
                                    </Dialog>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                      disabled={!canEditLeaderboard}
                                      title={!canEditLeaderboard ? "No permission" : undefined}
                                      onClick={() => {
                                        commitIfLeaderboardAllowed({
                                          ...store,
                                          leaderboard: store.leaderboard.filter((x) => x.id !== row.id),
                                        });
                                        toast('Row removed');
                                      }}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            ))}

                            {activeLeaderboardRows.length === 0 ? (
                              <div className="text-sm text-white/45">
                                No {leaderboardSportFilter === "Overall" ? "overall" : leaderboardSportFilter} leaderboard rows yet.
                              </div>
                            ) : null}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </TabsContent>

                {/* BRACKETING */}
                <TabsContent value="bracketing" className="mt-5">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <div data-tour-target="bracketing" className="text-lg font-semibold">Bracketing</div>
                        <div className="mt-1 text-sm text-white/55">
                          Choose a bracket format (single elimination or double elimination). Admins (or permitted roles) can edit match scores for single-elimination brackets.
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <div className="text-xs tracking-[0.18em] text-white/50">SPORT</div>
                          <Select
                            value={bracketSportFilter}
                            onValueChange={(v) => setBracketSportFilter(v as any)}
                          >
                            <SelectTrigger className="h-9 w-full sm:w-[220px] bg-black/30 border-white/15 text-white">
                              <SelectValue placeholder="Select sport" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ALL">All sports</SelectItem>
                              {store.settings.sports.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {isAdmin ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                >
                                  Manage sports
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="bg-black/80 border-white/15 text-white">
                                <DialogHeader>
                                  <DialogTitle>Manage sports</DialogTitle>
                                </DialogHeader>

                                <div className="grid gap-4">
                                  <div className="grid gap-2">
                                    <label className="text-xs tracking-[0.18em] text-white/60">ADD SPORT</label>
                                    <div className="flex items-center gap-2">
                                      <Input
                                        id="new-sport"
                                        placeholder="e.g., Table Tennis"
                                        className="bg-black/30 border-white/15 text-white"
                                      />
                                      <Button
                                        className="bg-cyan-300 text-black hover:bg-cyan-200"
                                        onClick={() => {
                                          const el = document.getElementById("new-sport") as HTMLInputElement | null;
                                          const name = (el?.value ?? "").trim();
                                          if (!name) {
                                            toast.error("Sport name is required");
                                            return;
                                          }
                                          if (store.settings.sports.some((s) => s.toLowerCase() === name.toLowerCase())) {
                                            toast("Sport already exists");
                                            return;
                                          }
                                          commitIfBracketsAllowed({
                                            ...store,
                                            settings: {
                                              ...store.settings,
                                              sports: [...store.settings.sports, name],
                                            },
                                          });
                                          if (el) el.value = "";
                                          toast.success("Sport added");
                                        }}
                                      >
                                        Add
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="grid gap-2">
                                    <div className="text-xs tracking-[0.18em] text-white/60">CURRENT SPORTS</div>
                                    <div className="grid gap-2">
                                      {store.settings.sports.map((s) => (
                                        <div
                                          key={s}
                                          className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                                        >
                                          <div className="text-sm">{s}</div>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                            onClick={() => {
                                              // remove sport + remove brackets that use it
                                              const nextSports = store.settings.sports.filter((x) => x !== s);
                                              if (nextSports.length === 0) {
                                                toast.error("At least one sport must remain");
                                                return;
                                              }
                                              const nextBrackets = store.brackets.filter((b) => b.sport !== s);
                                              commitIfBracketsAllowed({
                                                ...store,
                                                settings: { ...store.settings, sports: nextSports },
                                                brackets: nextBrackets,
                                              });
                                              if (bracketSportFilter === s) setBracketSportFilter("ALL");
                                              toast("Sport removed (and its brackets deleted)");
                                            }}
                                          >
                                            Delete
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="text-xs text-white/35">
                                      Deleting a sport will also delete brackets under that sport.
                                    </div>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : null}
                        </div>
                      </div>
                      {!isReadOnly ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            className="bg-cyan-300 text-black hover:bg-cyan-200"
                            disabled={!canEditBrackets}
                            title={!canEditBrackets ? "No permission" : undefined}
                          >
                            Add bracket
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-black/80 border-white/15 text-white">
                          <DialogHeader>
                            <DialogTitle>Add bracket</DialogTitle>
                          </DialogHeader>
                          <BracketEditor
                            sports={store.settings.sports}
                            onSave={(b) => {
                              commitIfBracketsAllowed({ ...store, brackets: [b, ...store.brackets] });
                              toast.success("Bracket saved");
                            }}
                          />
                        </DialogContent>
                      </Dialog>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-4">
                      {store.brackets
                        .filter((b) => bracketSportFilter === "ALL" || b.sport === bracketSportFilter)
                        .map((b) => (
                        <div key={b.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">{b.name}</div>
                              <div className="mt-1 text-xs text-white/45">
                                Sport: {b.sport} • Format: {b.format === "double" ? "Double elimination" : "Single elimination"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                    disabled={!canEditBrackets}
                                    title={!canEditBrackets ? "No permission" : undefined}
                                  >
                                    Edit teams/name
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-black/80 border-white/15 text-white">
                                  <DialogHeader>
                                    <DialogTitle>Edit bracket</DialogTitle>
                                  </DialogHeader>
                                  <BracketEditor
                                    value={b}
                                    sports={store.settings.sports}
                                    onSave={(next) => {
                                      commitIfBracketsAllowed({
                                        ...store,
                                        brackets: store.brackets.map((x) => (x.id === next.id ? next : x)),
                                      });
                                      toast.success("Bracket updated");
                                    }}
                                  />
                                </DialogContent>
                              </Dialog>

                              <Button
                                size="sm"
                                variant="outline"
                                className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                disabled={!canEditBrackets}
                                title={!canEditBrackets ? "No permission" : undefined}
                                onClick={() => {
                                  commitIfBracketsAllowed({
                                    ...store,
                                    brackets: store.brackets.filter((x) => x.id !== b.id),
                                  });
                                  toast("Bracket removed");
                                }}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>

                          {/* Rounds */}
                          <div className="mt-4 overflow-x-auto">
                            <div className="flex w-max min-w-full items-start gap-4">
                              {b.rounds.map((round, rIdx) => (
                                <div key={rIdx} className="w-[280px] shrink-0 rounded-xl border border-white/10 bg-black/25 p-3">
                                  <div className="text-xs tracking-[0.25em] text-white/55">{round.name.toUpperCase()}</div>

                                  <div className="mt-3 grid gap-3">
                                    {round.matches.map((m, mIdx) => (
                                      <div
                                        key={m.id}
                                        className="rounded-lg border border-white/10 bg-black/30 p-3"
                                      >
                                        <div className="grid gap-2">
                                          {(["a", "b"] as const).map((sideKey) => {
                                            const side = m[sideKey];
                                            const isWinner = m.winner === sideKey;
                                            return (
                                              <div
                                                key={sideKey}
                                                className={`flex items-center justify-between gap-3 rounded-md border px-2.5 py-2 ${
                                                  isWinner
                                                    ? "border-cyan-300/50 bg-cyan-300/10"
                                                    : "border-white/10 bg-black/25"
                                                }`}
                                              >
                                                <div className="min-w-0">
                                                  <div className="truncate text-sm">
                                                    {side.team ?? <span className="text-white/35">TBD</span>}
                                                  </div>
                                                </div>

                                                <Input
                                                  type="number"
                                                  min={0}
                                                  step={1}
                                                  value={side.score ?? ""}
                                                  onChange={(e) => {
                                                    updateBracketScore(b.id, rIdx, m.id, sideKey, e.target.value);
                                                  }}
                                                  // Keep score entry available in every bracket and round.
                                                  // TBD slots may be scored before teams are advanced; winner
                                                  // propagation still follows the selected Auto/Manual mode.
                                                  disabled={!canEditBrackets}
                                                  inputMode="numeric"
                                                  className="w-20 bg-black/30 border-white/15 text-white disabled:opacity-60"
                                                  placeholder="-"
                                                />
                                              </div>
                                            );
                                          })}

                                          {!bracketAutoAdvance ? (
                                            <div className="mt-1 flex items-center gap-2">
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                                disabled={!canEditBrackets || !m.a.team || !m.b.team}
                                                title={!canEditBrackets ? "No permission" : undefined}
                                                onClick={() => {
                                                  if (!canEditBrackets) return;
                                                  const brackets = store.brackets.map((bb) => {
                                                    if (bb.id !== b.id) return bb;
                                                    const rounds = bb.rounds.map((rr) => ({
                                                      ...rr,
                                                      matches: rr.matches.map((mm) => ({
                                                        ...mm,
                                                        a: { ...mm.a },
                                                        b: { ...mm.b },
                                                      })),
                                                    }));
                                                    const match = rounds[rIdx].matches[mIdx];
                                                    match.winner = "a";
                                                    propagateBracketRounds(rounds, "manual");
                                                    return { ...bb, rounds };
                                                  });
                                                  commitIfBracketsAllowed({ ...store, brackets });
                                                }}
                                              >
                                                Advance A
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="border-white/20 bg-transparent text-white hover:bg-white/10"
                                                disabled={!canEditBrackets || !m.a.team || !m.b.team}
                                                title={!canEditBrackets ? "No permission" : undefined}
                                                onClick={() => {
                                                  if (!canEditBrackets) return;
                                                  const brackets = store.brackets.map((bb) => {
                                                    if (bb.id !== b.id) return bb;
                                                    const rounds = bb.rounds.map((rr) => ({
                                                      ...rr,
                                                      matches: rr.matches.map((mm) => ({
                                                        ...mm,
                                                        a: { ...mm.a },
                                                        b: { ...mm.b },
                                                      })),
                                                    }));
                                                    const match = rounds[rIdx].matches[mIdx];
                                                    match.winner = "b";
                                                    propagateBracketRounds(rounds, "manual");
                                                    return { ...bb, rounds };
                                                  });
                                                  commitIfBracketsAllowed({ ...store, brackets });
                                                }}
                                              >
                                                Advance B
                                              </Button>
                                            </div>
                                          ) : null}

                                          {rIdx === 0 ? (
                                            <div className="text-[11px] text-white/35">
                                              Match {(mIdx + 1)}
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-white/35">
                            {b.format === "double" ? (
                              <>Double elimination is currently a preview: winners bracket works; losers bracket structure is shown (no auto drop-down yet).</>
                            ) : bracketAutoAdvance ? (
                              <>Tip: Enter scores for both teams. Higher score advances. Ties are not allowed.</>
                            ) : (
                              <>Tip: Enter scores (optional), then manually choose the winner to advance.</>
                            )}
                          </div>

                          {b.format === "double" ? (
                            <div className="mt-5">
                              <div className="text-xs tracking-[0.25em] text-white/55">LOSERS BRACKET (PREVIEW)</div>
                              <div className="mt-2 overflow-x-auto">
                                <div className="flex w-max min-w-full items-start gap-4">
                                  {(b.losersRounds ?? []).map((round, rIdx) => (
                                    <div key={rIdx} className="w-[280px] shrink-0 rounded-xl border border-white/10 bg-black/25 p-3">
                                      <div className="text-xs tracking-[0.25em] text-white/55">{round.name.toUpperCase()}</div>
                                      <div className="mt-3 grid gap-3">
                                        {round.matches.map((m) => (
                                          <div key={m.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                                            <div className="grid gap-2">
                                              {(["a", "b"] as const).map((sideKey) => {
                                                const side = m[sideKey];
                                                return (
                                                  <div
                                                    key={sideKey}
                                                    className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-2.5 py-2"
                                                  >
                                                    <div className="min-w-0">
                                                      <div className="truncate text-sm">
                                                        {side.team ?? <span className="text-white/35">TBD</span>}
                                                      </div>
                                                    </div>
                                                    <div className="text-xs text-white/35">—</div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
                                <div className="text-xs tracking-[0.25em] text-white/55">GRAND FINAL (PREVIEW)</div>
                                <div className="mt-2 grid gap-2">
                                  {(["a", "b"] as const).map((sideKey) => {
                                    const side = (b.grandFinal as any)?.[sideKey];
                                    return (
                                      <div
                                        key={sideKey}
                                        className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-2.5 py-2"
                                      >
                                        <div className="truncate text-sm">
                                          {side?.team ?? <span className="text-white/35">TBD</span>}
                                        </div>
                                        <div className="text-xs text-white/35">—</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}

                      {store.brackets.filter((b) => bracketSportFilter === "ALL" || b.sport === bracketSportFilter).length === 0 ? (
                        <div className="text-sm text-white/45">No brackets for this sport yet.</div>
                      ) : null}
                    </div>
                  </div>
                </TabsContent>

{/* EVALUATION */}
                <TabsContent value="evaluation" className="mt-5">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                    <div data-tour-target="evaluation" className="text-lg font-semibold">Evaluation</div>
                    <div className="mt-2 text-sm text-white/55">Coming soon.</div>
                  </div>
                </TabsContent>

                {/* SETTINGS (admin only) */}
                {isAdmin ? (
                <TabsContent value="settings" className="mt-5">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-5 md:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold">Countdown Settings</div>
                        <div className="mt-2 text-sm text-white/55">
                          Change the countdown target time, or close the countdown page (redirects to login).
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4">
                      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-4">
                        <div className="text-sm font-medium">Permissions</div>
                        <div className="mt-1 text-xs text-white/45">
                          Choose which roles can edit each module. Only admins can change these rules.
                        </div>

                        <div className="mt-4 grid gap-4">
                          {([
                            { key: "newsEditors", label: "NEWS" },
                            { key: "summitEditors", label: "EMERGENCY HOTLINE" },
                            { key: "leaderboardEditors", label: "LEADERBOARD" },
                            { key: "bracketEditors", label: "BRACKETING" },
                            { key: "scheduleEditors", label: "MATCH SCHEDULE" },
                            { key: "mapEditors", label: "MAP" },
                            { key: "settingsEditors", label: "SETTINGS" },
                          ] as const).map((perm) => (
                            <div key={perm.key} className="grid gap-2">
                              <div className="text-xs tracking-[0.18em] text-white/60">{perm.label} EDITORS</div>
                              <div className="flex flex-wrap gap-3">
                                {(["admin", "staff", "sports"] as const).map((r) => (
                                  <label key={r} className="flex items-center gap-2 text-sm text-white/75">
                                    <Checkbox
                                      checked={(store.settings.permissions as any)[perm.key]?.includes(r)}
                                      disabled={!isAdmin}
                                      onCheckedChange={(v) => {
                                        if (!isAdmin) return;
                                        const current: string[] = (store.settings.permissions as any)[perm.key] ?? [];
                                        const next = new Set(current);
                                        if (v) next.add(r);
                                        else next.delete(r);
                                        setStore((prev) => ({
                                          ...prev,
                                          settings: {
                                            ...prev.settings,
                                            permissions: {
                                              ...(prev.settings.permissions as any),
                                              [perm.key]: Array.from(next),
                                            },
                                          },
                                        }));
                                      }}
                                    />
                                    <span className="capitalize">{r}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
<div className="grid gap-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">Viewer Tutorial Guide</div>
                            <div className="mt-1 text-xs leading-relaxed text-white/50">
                              Turn the automatic first-login guide on or off for viewer accounts.
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center">
                            <Switch
                              checked={viewerTutorialEnabled}
                              disabled={!isAdmin}
                              aria-label="Enable viewer tutorial guide"
                              onCheckedChange={(checked) => {
                                if (!isAdmin) {
                                  toast("Admin only");
                                  return;
                                }
                                const enabled = Boolean(checked);
                                setViewerTutorialEnabled(enabled);
                                try {
                                  window.localStorage.setItem("rcess-viewer-tour-enabled", String(enabled));
                                  if (!enabled) {
                                    setViewerTourOpen(false);
                                    setMobileNavOpen(false);
                                  }
                                  toast.success(`Viewer tutorial guide turned ${enabled ? "on" : "off"}.`);
                                } catch {
                                  toast.error("Could not save the viewer tutorial setting in this browser.");
                                }
                              }}
                            />
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-4">
                          <div className="text-sm font-medium">Reset viewer tutorial</div>
                          <div className="mt-1 max-w-2xl text-xs leading-relaxed text-white/50">
                            Reset the first-login guide progress for viewer accounts. The guide will appear again the next time each viewer logs in using this browser, provided the tutorial is turned on.
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-3 w-full border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20 sm:w-fit"
                            disabled={!isAdmin}
                            onClick={() => {
                              if (!isAdmin) {
                                toast("Admin only");
                                return;
                              }
                              try {
                                const keysToRemove: string[] = [];
                                for (let i = 0; i < window.localStorage.length; i += 1) {
                                  const key = window.localStorage.key(i);
                                  if (key?.startsWith("rcess-viewer-tour-complete:")) {
                                    keysToRemove.push(key);
                                  }
                                }
                                keysToRemove.forEach((key) => window.localStorage.removeItem(key));
                                toast.success("Viewer tutorial progress reset. It will appear on the next viewer login if enabled.");
                              } catch {
                                toast.error("Could not reset viewer tutorials in this browser.");
                              }
                            }}
                          >
                            Reset viewer tutorial
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-2 rounded-xl border border-white/10 bg-black/30 px-4 py-4">
                        <label className="text-xs tracking-[0.18em] text-white/60">TARGET ISO</label>
                        <div className="text-xs leading-relaxed text-white/45">
                          Set the countdown target date and time. Use ISO 8601 format, for example: 2026-08-01T00:00:00+08:00.
                        </div>
                        <Input
                          value={store.settings.countdownIso}
                          onChange={(e) =>
                            setStore((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, countdownIso: e.target.value },
                            }))
                          }
                          disabled={!canEditSettings}
                          className="w-full bg-black/30 border-white/15 text-white disabled:opacity-60"
                          placeholder="2026-08-01T00:00:00+08:00"
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <div>
                          <div className="text-sm font-medium">Close countdown page</div>
                          <div className="text-xs text-white/45">
                            When enabled, opening the countdown page redirects to login.
                          </div>
                        </div>
                        <Switch
                          checked={store.settings.countdownClosed}
                          onCheckedChange={(v) =>
                            setStore((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, countdownClosed: Boolean(v) },
                            }))
                          }
                          disabled={!canEditSettings}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                        <div>
                          <div className="text-sm font-medium">Bracket auto-advance</div>
                          <div className="text-xs text-white/45">
                            Auto: winner is decided by scores. Manual: admin selects who advances.
                          </div>
                        </div>
                        <Switch
                          checked={store.settings.bracketAutoAdvance}
                          onCheckedChange={(v) =>
                            setStore((prev) => ({
                              ...prev,
                              settings: { ...prev.settings, bracketAutoAdvance: Boolean(v) },
                            }))
                          }
                          disabled={!canEditSettings}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          className="bg-cyan-300 text-black hover:bg-cyan-200"
                          disabled={!canEditSettings}
                          title={!canEditSettings ? "No permission" : undefined}
                          onClick={() => {
                            if (!canEditSettings) {
                              toast("No permission to edit Settings");
                              return;
                            }
                            // Save also persists permission rules
                            saveStore(store);
                            toast.success("Settings saved");
                          }}
                        >
                          Save settings
                        </Button>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                ) : null}
              </Tabs>
            </div>

            <div className="rcess-tab" aria-hidden />
          </Card>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 text-xs text-white/35">
          <div>RCESS Portal Prototype • Replace placeholders with official details.</div>
          <Badge className="bg-white/10 text-white border border-white/15 hover:bg-white/10">
            Digital Pass (moved off landing)
          </Badge>
        </div>
      </div>

      {viewerTourOpen ? (
        <div className="pointer-events-none fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="RCESS first-visit guide">
          <div className="pointer-events-none absolute inset-0 bg-black/65" />
          {viewerTourRect ? (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed rounded-xl border-2 border-cyan-300 shadow-[0_0_0_4px_rgba(34,211,238,0.16),0_0_24px_rgba(34,211,238,0.38)] transition-all duration-200"
              style={{
                top: viewerTourRect.top,
                left: viewerTourRect.left,
                width: viewerTourRect.width,
                height: viewerTourRect.height,
              }}
            />
          ) : null}
          <div
            className="pointer-events-auto fixed z-[102] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[300px] overflow-y-auto rounded-xl border border-cyan-300/35 bg-[#050824] p-3 text-white shadow-2xl sm:max-w-[360px] sm:rounded-2xl sm:p-5"
            style={viewerTourRect ? { top: viewerTourRect.tipTop, left: viewerTourRect.tipLeft } : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-cyan-200 sm:text-[10px] sm:tracking-[0.22em]">First visit guide</div>
              <div className="text-xs text-white/45">{viewerTourStep + 1} of {viewerTourSteps.length}</div>
            </div>
            <h2 className="mt-1.5 text-base font-semibold sm:mt-2 sm:text-lg">{viewerTourSteps[viewerTourStep]?.title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-white/70 sm:mt-2 sm:text-sm">{viewerTourSteps[viewerTourStep]?.description}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 sm:mt-5 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-xs text-white/65 hover:bg-white/10 hover:text-white sm:h-9 sm:px-3 sm:text-sm"
                onClick={() => {
                  try {
                    window.localStorage.setItem(`rcess-viewer-tour-complete:${(session.email ?? "viewer").toLowerCase()}`, "true");
                  } catch { /* The tour can still be dismissed for this session. */ }
                  setViewerTourOpen(false);
                  setMobileNavOpen(false);
                }}
              >
                Skip tour
              </Button>
              <div className="flex items-center gap-2">
                {viewerTourStep > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-2 text-xs border-white/20 bg-transparent text-white hover:bg-white/10 sm:h-9 sm:px-3 sm:text-sm"
                    onClick={() => moveViewerTourToStep(Math.max(0, viewerTourStep - 1))}
                  >
                    Back
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="h-8 px-3 text-xs bg-cyan-300 text-black hover:bg-cyan-200 sm:h-9 sm:px-4 sm:text-sm"
                  onClick={() => {
                    if (viewerTourStep >= viewerTourSteps.length - 1) {
                      try {
                        window.localStorage.setItem(`rcess-viewer-tour-complete:${(session.email ?? "viewer").toLowerCase()}`, "true");
                      } catch { /* The tour can still be dismissed for this session. */ }
                      setViewerTourOpen(false);
                      setMobileNavOpen(false);
                    } else {
                      moveViewerTourToStep(Math.min(viewerTourSteps.length - 1, viewerTourStep + 1));
                    }
                  }}
                >
                  {viewerTourStep >= viewerTourSteps.length - 1 ? "Finish tour" : "Next"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
