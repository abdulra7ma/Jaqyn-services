import type { FormFields } from './components/LeadForm';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface LeadResponse {
  data: { id: string };
}

/**
 * POST /api/businesses/register-lead/
 * Maps landing FormFields to the backend BusinessLeadSerializer shape.
 * Throws an Error on any non-2xx response (message contains the status code).
 */
export async function submitLead(form: FormFields): Promise<LeadResponse> {
  const response = await fetch(`${API_BASE}/api/businesses/register-lead/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: form.name,
      owner_name: form.owner,
      email: form.email,
      // Strip any existing +996 prefix or country code before re-attaching, so
      // pasting '+996700123456' doesn't double-prefix to '+996+996700123456'.
      phone: `+996${form.phone.replace(/^\+?996/, '').replace(/\D/g, '')}`,
      category: form.cat,
      area: form.area,
      instagram_url: form.ig,
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<LeadResponse>;
}
