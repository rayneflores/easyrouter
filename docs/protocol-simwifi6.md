# Protocolo — SIM WiFi6 Router (F0+F1)

Reverse-engineering del panel web (Vue+webpack) servido en `http://192.168.5.1`.
Fuente: `app.js` + 49 chunks del bundle + **tráfico autenticado real** contra el equipo.
Modelo real confirmado: **OLAX GX3000 Pro** (fw sw_version 18051C). Actualizado 2026-10-09.

## Resumen del transporte

- **Base URL:** `/v1/admin/api/`
- **Un endpoint = una ruta** bajo esa base. Verbos `GET` y `POST`.
- **Token en query string:** toda petición lleva `?token=<token>`. El token se guarda en
  `localStorage.token` tras el login y se mete en cada URL.
- **Body POST:** JSON. El helper añade `_: <timestamp>` a los datos (anti-caché).
  Tercer argumento del helper `$post(url, data, asJson)`: si `true` → body JSON;
  si `false` → `application/x-www-form-urlencoded` (querystring con `arrayFormat:brackets`).
- **NO hay cifrado de transporte.** (Verificado: todos los `encrypt`/`AES`/`base64` del bundle
  son o bien config de WiFi —`auth`/`encrypt`/`key` del SSID— o la librería MD5. El cuerpo viaja en claro.)
- **Envelope de respuesta:** `{ status, data }`.
  - `status === 0` → éxito; el interceptor devuelve directamente `e.data` (el objeto completo, no solo `.data`).
  - `status === 1` (en login) → caso especial de sesión.
  - Si la respuesta no trae `status` y no estás en login → el panel redirige a `/login` (sesión caída).
- CORS abierto: el router responde `Access-Control-Allow-Origin: *`. Aun así el gateway (D-03)
  evita problemas de mixed-content http/https desde el navegador.

## Autenticación  (CONFIRMADO con tráfico real)

Login es **GET** (no POST), con los parámetros en la query string:

```
GET /v1/admin/api/login?username=<user>&password=<md5>&_=<ts>&token=
md5 = md5(password.trim())           # ¡trim antes del hash!
resp: { status:0, data:{ token:"<hex32>", refresh:"<hex32>" } }
```

- La contraseña se hashea **MD5 en cliente** (de la contraseña *recortada*).
- El token viene en `data.token`; se usa en `?token=` de todas las peticiones siguientes.
- `status:1` = error (p.ej. `data:"Sin nombre de usuario."`).
- Reads = **GET** (params en query). Writes y `transfor_frontend` = **POST** (JSON body).
- `GET login` se usa como *ping* de "¿sigue viva la sesión / ya arrancó el router?" tras reboot.
- Logout: `login_out`. Timeout de sesión: `login_timeout` / `login_timeout` get.
- Cambiar contraseña de admin: `system_auth` (con `password`/`surePassword` en MD5),
  verificación previa con `system_auth_password_check`.

## El dispatcher `transfor_frontend`

Endpoint genérico (74 usos) que enruta a subsistemas del firmware por comando namespaced:

```
POST /v1/admin/api/transfor_frontend?token=<t>
body: { cmd: "wifi.wifi_1_web_get", data: { noData: "" } }
resp: { status: 0, data: { enable:"yes", mode, bandwidth, channel, ... } }
```

Namespaces vistos: `wifi.*` (17 cmds), `system.*` (ledswitch), `extra_device_info.*`,
`extra_fw_manage.*` (firmware), y comandos sueltos `reboot`, `reset`, `all`, `2g`.
Lista completa de subcomandos al final.

## Mapa de endpoints (147)

Agrupados por función para el diseño del driver. Nombre = ruta bajo `/v1/admin/api/`.

### Sesión / sistema
`login` · `login_out` · `login_timeout` · `system_auth` · `system_auth_password_check`
· `system_sysinfo` · `system_set` (incluye `{cmd:"reboot"}`) · `system_logget`
· `system_language_get` · `system_language_change` · `system_upgrade` · `system_upload`
· `system_backupload` · `system_restore` · `status_cpu` · `status_internet` · `boottime_get` · `boottime_set`

### WAN 4G/5G (SIM)
`wan4g_baseinfo_get` · `wan4g_sim_status` · `wan4g_network_status` · `wan4g_mobile_network`
· `wan4g_mobiledata_set` · `wan4g_mode_set` · `wan4g_search_mode` · `wan4g_roaming_set`
· `wan4g_select_operator` · `wan4g_profile_get` · `wan4g_profile_select` · `wan4g_profile_delete`
· PIN: `wan4g_pin_state` · `wan4g_pin_lock` · `wan4g_pin_lock_status` · `wan4g_modify_pin`
· `wan4g_pin_retry_times_get`
· USSD: `ussd_send` · `ussd_cancel` · `ussd_flush_page`

### Interfaces / LAN / topología
`iface_get` · `iface_set` · `iface_status` · `iface_mode` · `iface_get_onlineinfo`
· `iface_get_lan_isolation` · `iface_set_lan_isolation`
· Mesh/MAP: `map_connect_state` · `map_get_topology` · `map_get_role` · `map_set_role`
· `map_get_effectrole` · `map_get_rssith` · `map_set_rssith` · `map_switch_get` · `map_switch_set`
· `map_trigger_onboarding`

### WiFi / WLAN
`wlan_get_private` · `wlan_set_private` · `wlan_get_public` · `wlan_get_closetime` · `wlan_set_closetime`
· `wlan_get_ieee80211r` · `wlan_set_ieee80211r` · `wlan_chanid_get` · `wlan_compatible_get`
· `wlan_compatible_set` · `wlan_scan` · `wlan_relay_get` · `wlan_relay_set` · `wlan_relay_state`
· `wmm_get` · `wps_pbc` · `bs_get` · `radio_high_performance_get`
· `wireless_synchronize_get` · `wireless_synchronize_set`
· vía `transfor_frontend`: `wifi.*` (ver subcomandos)

### Clientes conectados / control de acceso
`userlist_get` · `userlist_control_get` · `user_cur_access_get`
· Lista negra/blanca: `bwlist_get` · `bwlist_add` · `bwlist_del` · `bwlist_move` · `bwlist_set_mode`
· `bwlist_ssid_map_get`
· Filtros: `filter_ip_*` (get/set/del/move/select) · `filter_mac_*` (get/set/del/move/select)
· Bind MAC-IP: `bind_get` · `bind_del`

### Red avanzada / NAT / firewall
`dmz_get` · `dmz_set` · `dnat_get` · `dnat_set` · `dnat_del` · `dnat_enable` · `dnat_adjust`
· `netrule_get` · `netrule_set` · `netrule_del` · `netrule_switch` · `netrule_switch_get`
· `alg_get` · `alg_set` · `hnat_get` · `hnat_set` · `ddos_get` · `ddos_set`
· `ipv6_get` · `ipv6_set` · `ipv6_iface_status`
· `ddns_get` · `ddns_set` · `ddns_state`
· `iptv_get` · `iptv_set`
· VPN: `vpnclient_get` · `vpnclient_set` · `vpnclient_status`

### QoS / control parental / tráfico
`flow_get` · `flow_set` · `tc_get` · `tc_set` · `tc_add` · `tc_del` · `tc_get_switch` · `tc_set_switch`
· URL filter: `url_list` · `url_N_set` · `url_delete` · `url_get_mode` · `url_set_mode`
· `url_get_enable` · `url_set_enable`

### Tiempo / otros
`sntp_get` · `sntp_set` · `sntp_time_get` · `sntp_timezone_get` · `zigbee_get`

### Subcomandos de `transfor_frontend`
```
reboot · reset · all · 2g
system.ledswitch_get · system.ledswitch_set
extra_device_info.extra.device_info_web_get · extra_device_info.extra.device_info_set
extra_fw_manage.extra.fw_manage_check · .fw_manage_query · .fw_manage_upgrade
wifi.get_default_wifi · wifi.web_radio_switch_get/set
wifi.Dual_frequency_get_wifi · .Dual_frequency_set_wifi · .Dual_frequency_status
wifi.wifi_1_web_get/set · wifi.wifi_2_web_get/set
wifi.wifi_1_ap_web_get/list/set · wifi.wifi_2_ap_web_list/set
wifi.wps_get_switch · wifi.wps_set_switch
```

## Mapeo a capacidades del driver (hacia D-02)

| Capacidad `RouterDriver` | Endpoint(s) |
|---|---|
| `login` / `logout`       | `login` (pwd MD5) / `login_out` |
| `getStatus` / `getSysInfo` | `system_sysinfo`, `status_cpu`, `status_internet` |
| `getWan` (señal/SIM)     | `wan4g_baseinfo_get`, `wan4g_sim_status`, `wan4g_network_status` |
| `getWifi` / `setWifi`    | `transfor_frontend` → `wifi.wifi_1_web_get` / `wifi.wifi_1_web_set` (2.4G), `wifi_2_*` (5G) |
| `listClients`            | `userlist_get`, `iface_get_onlineinfo` |
| `reboot`                 | `system_set {cmd:"reboot"}` o `transfor_frontend {cmd:"reboot"}` |
| `factoryReset`           | `system_restore` / `transfor_frontend {cmd:"reset"}` |
| `getPortForwarding`/`set`| `dnat_get` / `dnat_set` / `dnat_del` |
| `accessControl` (opt)    | `bwlist_*`, `filter_mac_*`, `filter_ip_*` |

## Formas de respuesta confirmadas (tráfico real)

- **`system_sysinfo`** (GET): `{ mac_addr, device_name, imei_code, hw_version, distribution,
  memory:{used,total}, version, sw_version, imsi_code, time, cpu_stat, uptime }`.
- **`iface_get_onlineinfo`** (GET): `{ wan:{ wan_proto, wan_ipaddr, wan_gwaddr, wan_mask,
  wan_macaddr, dns, res_dns }, wan_usb:{...} }`. → fuente real del estado WAN (ethernet DHCP).
- **`status_internet`** (GET): `{ rx, tx }` (throughput acumulado).
- **`wan4g_baseinfo_get` / `wan4g_sim_status` / `wan4g_network_status`**: **vacíos** en este equipo
  (el módulo celular no está activo; WAN va por ethernet). El driver no depende de ellos.
- **`userlist_get`** (GET): `{ guest:{}, master:[ { mac, ip, hostname, host_name, usertype,
  link_type, online, uptime, netusage, wlan_info:{ essid, band, rssi, channel, encryption },
  ether_info:{...} } ] }`. Clientes = `master[]` + valores de `guest{}`.
- **`dnat_get`** (GET): `{ enable, dnats:[] }`. Reglas de port-forwarding en `dnats[]`.
- **WiFi — multi-SSID por banda**:
  - SSID/clave/auth/hide/enable: `transfor_frontend {cmd:"wifi.wifi_1_ap_web_list"}` (2.4G) y
    `wifi.wifi_2_ap_web_list` (5G). Devuelven **array** de SSIDs; el primario es `idx:1` / `enable:"yes"`.
    Set: `wifi.wifi_1_ap_web_set` / `wifi.wifi_2_ap_web_set` (reenviar el objeto completo con cambios).
  - Canal/ancho/modo (radio): `wifi.wifi_1_web_get` / `wifi.wifi_2_web_get`
    (`{ enable, channel, currentChannel, bandwidth, mode, txpower, auth }`, sin SSID).
  - Red de invitados: `wlan_get_private` (objetos `2g`/`5g` con `wlanid:"guest_*"`).
  - `wifi.Dual_frequency_status` = `"close"` → bandas separadas (SSID fusionado NO activo).

## Escrituras confirmadas (tráfico real, F4)

Regla clave del transporte en escritura:
- **`transfor_frontend`** → body **JSON** (`$post(..., true)` en el panel).
- **Endpoints directos** (`dnat_add`, `dnat_del`, `system_set`, …) → body
  **`application/x-www-form-urlencoded`** con arrayFormat brackets (`$post` sin 3er arg).
  Enviar JSON a estos devuelve HTTP 500.

- **WiFi** `transfor_frontend {cmd:"wifi.wifi_1_ap_web_set", data:{...}}` (2.4G) / `wifi_2_ap_web_set` (5G).
  Campos EXACTOS (no reenviar el objeto entero del list):
  `{ myidx:<idx>, ssid, key, enable:"yes"|"no", hide:0|1, auth, encrypt }`.
- **Port-forward alta** `POST dnat_add` (form-urlencoded):
  `{ fwdesc, fwname, to_dip:<ip LAN>, proto:"tcp"|"udp"|"tcp udp", enable:"true"|"false",
     from_dports_start, from_dports_end, to_dports_start, to_dports_end,
     from_dports:"a[-b]", to_dports:"a[-b]", reflection:"0", from_szid:1, to_dzid:0 }`.
  Notas: el IP interno es `to_dip` (no `ip`); `enable` es `"true"/"false"` (no 1/0/yes).
- **Port-forward baja** `POST dnat_del` (form): `{ fwids: "<JSON array>" }`, p.ej. `fwids=[0]`
  (string JSON, NO `fwids[]=0`). El id de cada regla es `fwid` en `dnat_get.dnats[]`.
- **Reboot** `POST system_set {cmd:"reboot"}` (form). Confirmado por bundle; NO ejecutado en pruebas.
- **Red de invitados** = SSID `myidx:3` de cada banda (no sale en `*_ap_web_list`).
  Lectura: `transfor_frontend {cmd:"wifi.wifi_1_ap_web_get", data:{myidx:3}}` (2.4G) / `wifi_2_*` (5G).
  Escritura: `wifi.wifi_X_ap_web_set` con `{ myidx:3, enable, ssid, key, auth, hide, encrypt:"aes",
  accessmode, accessrule:1, allowedipport:"", usbandwidth, dsbandwidth }` (`accessrule:1` = invitados).
  Extras del panel no implementados: `wlan_get/set_closetime` (duración) e `iface_get/set_lan_isolation`.
- **QoS** ("Control de flujo", límite por dispositivo en kb/s; 0 = sin límite), todo form-urlencoded:
  `tc_get_switch` → `{enable:"1"|"0"}` (`{}` si nunca se configuró) · `tc_set_switch {enable}` ·
  `tc_get` → `[{ Name, Mac, Ip, Upload, Download, Enable, From }]` (`{}` si vacío) ·
  `tc_add` / `tc_set` `{ Name, Mac, Ip, Upload, Download, Enable:true, From:"WEB" }` ·
  `tc_del {Macs:"<JSON array de MACs>"}`.

Validado con `packages/driver-simwifi6/test/writes.integration.test.ts` (gate `RUN_WRITE_TESTS=1`).

## Sesión caducada

Cuando el token de sesión expira (inactividad), los endpoints responden `{status:1, data:"LOGINOUT"}`.
El transporte mapea ese caso a `DriverError("AUTH")` (no PROTOCOL); `RouterSession` lo captura,
re-loguea una vez y reintenta la operación de forma transparente (con dedupe de logins concurrentes).

## Pendiente menor
- Si https (443) usa cert self-signed (`ROUTER_INSECURE_TLS=1` en el gateway si hiciera falta).
- Edición de reglas existentes (`dnat_set` por regla) y `dnat_adjust` (prioridad): no implementados aún.
