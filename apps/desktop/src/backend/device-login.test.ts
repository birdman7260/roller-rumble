import { describe, expect, it } from "vitest";
import { readDeviceLogin } from "./device-login";

function requestWithHeaders(headers: Record<string, string>) {
  return {
    get(name: string) {
      return headers[name.toLowerCase()];
    }
  };
}

describe("readDeviceLogin", () => {
  it("reads the device login from the bearer header", () => {
    expect(readDeviceLogin(requestWithHeaders({ authorization: "Bearer signed.token" }))).toBe(
      "signed.token"
    );
  });

  it("does not authenticate a request that carries the device login only in a cookie", () => {
    expect(
      readDeviceLogin(requestWithHeaders({ cookie: "roller_rumble_racer_session=signed.token" }))
    ).toBeNull();
  });

  it("ignores authorization schemes other than bearer", () => {
    expect(readDeviceLogin(requestWithHeaders({ authorization: "Basic abc123" }))).toBeNull();
  });
});
