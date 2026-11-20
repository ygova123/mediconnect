import {
  Activity, Ambulance, Apple, ArrowRight, ArrowUpRight, BookOpenText, Building2,
  CalendarCheck, CalendarDays, CalendarHeart, Check, ChevronDown, Clock3, Coffee, Droplets,
  ExternalLink, HeartPulse, House, ImagePlus, Info, LayoutDashboard,
  Leaf, ListFilter, LockKeyhole, LogOut, Mail, MapPin, MapPinned,
  MoonStar, MoveRight, Pencil, PhoneCall, Plus, Salad, Search, Shield, ShieldCheck,
  Sparkles, Star, Stethoscope, Sun, Tags, Trash2, UserRound, X, createIcons,
} from "https://esm.sh/lucide@0.468.0";

const iconMap = {
  Activity, Ambulance, Apple, ArrowRight, ArrowUpRight, BookOpenText, Building2,
  CalendarCheck, CalendarDays, CalendarHeart, Check, ChevronDown, Clock3, Coffee, Droplets,
  ExternalLink, HeartPulse, House, ImagePlus, Info, LayoutDashboard,
  Leaf, ListFilter, LockKeyhole, LogOut, Mail, MapPin, MapPinned,
  MoonStar, MoveRight, Pencil, PhoneCall, Plus, Salad, Search, Shield, ShieldCheck,
  Sparkles, Star, Stethoscope, Sun, Tags, Trash2, UserRound, X,
};

export function renderIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((element) => {
    element.setAttribute("data-lucide", element.getAttribute("data-icon") || "");
    element.removeAttribute("data-icon");
  });
  createIcons({ icons: iconMap, attrs: { class: "lucide", "aria-hidden": "true" } });
}
