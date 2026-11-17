// Soft colors for the pet circles. They avoid the priority yellow, green and lilac.
export const PET_COLORS = ["#F9C9BB", "#C5E2F5", "#F5CBE0", "#BDE6E1", "#FBD9A8", "#E3D5C3"];
export const OWNER_COLOR = "#F9C9BB";

// A pet's color comes from its position in the owner's pet list.
export function petColorFor(pets, petId) {
  const i = pets.findIndex((p) => p.id === petId);
  return PET_COLORS[(i < 0 ? 0 : i) % PET_COLORS.length];
}