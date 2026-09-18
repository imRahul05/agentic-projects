export interface LocationRef {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly region: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone?: string;
}

export interface CoordinatesInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly name?: string;
}

export type LocationInput = string | LocationRef | CoordinatesInput;

export function isLocationRef(input: LocationInput): input is LocationRef {
  return (
    typeof input === "object" &&
    input !== null &&
    "id" in input &&
    "name" in input &&
    "latitude" in input &&
    "longitude" in input
  );
}

export function isCoordinatesInput(input: LocationInput): input is CoordinatesInput {
  return (
    typeof input === "object" &&
    input !== null &&
    !("id" in input) &&
    "latitude" in input &&
    "longitude" in input
  );
}
