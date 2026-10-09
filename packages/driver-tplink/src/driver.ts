import {
  DriverError,
  type AccessControl,
  type AccessMode,
  type Capability,
  type ClientDevice,
  type DeviceInfo,
  type PortForwardRule,
  type RouterCredentials,
  type RouterDriver,
  type WanStatus,
  type WifiNetwork,
  type WifiUpdate,
} from "@ryfsystems/core";
import { TpLinkClient } from "./transport.js";

// Driver compartido TP-Link / Mercusys. La detección funciona; las operaciones
// autenticadas quedan pendientes de validar con un equipo real (ver transport.ts).
export class TpLinkFamilyDriver implements RouterDriver {
  readonly id: string;
  private readonly c: TpLinkClient;

  constructor(id: string, creds: RouterCredentials) {
    this.id = id;
    this.c = new TpLinkClient(creds);
  }

  capabilities(): Capability[] {
    // Capacidades previstas una vez completado el protocolo.
    return ["wan", "wifi.read", "wifi.write", "clients", "reboot", "factoryReset", "portForward.read", "portForward.write", "accessControl"];
  }

  login() {
    return this.c.login();
  }
  logout() {
    return this.c.logout();
  }

  private pending(): never {
    throw new DriverError(
      `Driver ${this.id}: pendiente de validar con un equipo real o captura del panel.`,
      "UNSUPPORTED",
    );
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    this.pending();
  }
  async getWan(): Promise<WanStatus> {
    this.pending();
  }
  async getWifi(): Promise<WifiNetwork[]> {
    this.pending();
  }
  async setWifi(_u: WifiUpdate): Promise<void> {
    this.pending();
  }
  async listClients(): Promise<ClientDevice[]> {
    this.pending();
  }
  async reboot(): Promise<void> {
    this.pending();
  }
  async factoryReset(): Promise<void> {
    this.pending();
  }
  async changeAdminPassword(_current: string, _next: string): Promise<void> {
    this.pending();
  }
  async getPortForwarding(): Promise<PortForwardRule[]> {
    this.pending();
  }
  async addPortForward(_r: PortForwardRule): Promise<void> {
    this.pending();
  }
  async deletePortForward(_id: string): Promise<void> {
    this.pending();
  }
  async getAccessControl(): Promise<AccessControl> {
    this.pending();
  }
  async setAccessMode(_enabled: boolean, _mode: AccessMode): Promise<void> {
    this.pending();
  }
  async addAccessEntry(_list: AccessMode, _mac: string, _name?: string): Promise<void> {
    this.pending();
  }
  async removeAccessEntry(_list: AccessMode, _mac: string): Promise<void> {
    this.pending();
  }
  async getDmz(): Promise<import("@ryfsystems/core").Dmz> {
    this.pending();
  }
  async setDmz(_enabled: boolean, _destIp: string): Promise<void> {
    this.pending();
  }
  async getNetwork(): Promise<import("@ryfsystems/core").NetworkConfig> {
    this.pending();
  }
  async setLan(): Promise<void> {
    this.pending();
  }
  async setEthernet(): Promise<void> {
    this.pending();
  }
}

export function createTpLinkDriver(id: string, creds: RouterCredentials): RouterDriver {
  return new TpLinkFamilyDriver(id, creds);
}
