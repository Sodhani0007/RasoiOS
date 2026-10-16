export function fitsMealCategory(category: string, mealType: string) {
  const value = category.toLowerCase();
  return (
    value.includes(mealType) ||
    ["any", "all"].includes(value) ||
    (value === "breads" && ["lunch", "dinner"].includes(mealType)) ||
    (mealType === "snack" && value.includes("breakfast"))
  );
}
