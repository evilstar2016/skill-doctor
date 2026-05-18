const SKILLS_SH_BASE_URL = 'https://skills.sh/api/skills';

export async function fetchMarketplaceSkill(slug: string): Promise<string> {
  const url = `${SKILLS_SH_BASE_URL}/${slug}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Skill '${slug}' not found in marketplace (${response.status})`);
  }
  return response.text();
}
