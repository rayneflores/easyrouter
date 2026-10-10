import { useEffect, useState } from "react";

const LATEST_RELEASE = "https://api.github.com/repos/rayneflores/easyrouter/releases/latest";

const newer = (a: string, b: string): boolean => {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
};

// En Android la APK se instala fuera de la Play Store: no hay actualización automática del sistema,
// así que se avisa cuando la última Release de GitHub es más nueva que la app instalada.
export function UpdateBanner() {
  const [update, setUpdate] = useState<{ version: string; url: string }>();

  useEffect(() => {
    fetch(LATEST_RELEASE)
      .then((r) => (r.ok ? r.json() : undefined))
      .then((rel: { tag_name?: string; html_url?: string; assets?: { name: string; browser_download_url: string }[] } | undefined) => {
        if (!rel?.tag_name || !newer(rel.tag_name, __APP_VERSION__)) return;
        const apk = rel.assets?.find((a) => a.name.endsWith(".apk"));
        setUpdate({ version: rel.tag_name.replace(/^v/, ""), url: apk?.browser_download_url ?? rel.html_url ?? "" });
      })
      .catch(() => {});
  }, []);

  if (!update) return null;
  return (
    <div className="update-banner">
      Nueva versión {update.version} disponible (tienes {__APP_VERSION__}).{" "}
      <a href={update.url} target="_blank" rel="noreferrer">Descargar</a>
    </div>
  );
}
