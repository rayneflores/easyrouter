import type { DeviceType } from "@ryfsystems/core";

export const TYPE_META: Record<DeviceType, { label: string; icon: string }> = {
  phone: { label: "Móvil", icon: "📱" },
  tablet: { label: "Tablet", icon: "📲" },
  laptop: { label: "Portátil", icon: "💻" },
  desktop: { label: "Sobremesa", icon: "🖥️" },
  tv: { label: "TV", icon: "📺" },
  console: { label: "Consola", icon: "🎮" },
  speaker: { label: "Altavoz", icon: "🔊" },
  watch: { label: "Reloj", icon: "⌚" },
  camera: { label: "Cámara IP", icon: "📹" },
  printer: { label: "Impresora", icon: "🖨️" },
  router: { label: "Router/AP", icon: "📶" },
  nas: { label: "NAS", icon: "🗄️" },
  iot: { label: "IoT", icon: "💡" },
  other: { label: "Otro", icon: "🔌" },
  unknown: { label: "Desconocido", icon: "❓" },
};
