type DemoUser = {
  id: string;
  organisationId: string;
  email: string;
  name: string;
  role: string;
};

export interface DemoOrganisationInput {
  organisation: {
    id: string;
    name: string;
    slug: string;
  };
  users: DemoUser[];
  outlets: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }>;
}

export interface DemoOrganisationResult {
  organisationId: string;
  usersCreated: number;
  outletsCreated: number;
}

export function createDemoOrganisationWorkflow(input: DemoOrganisationInput): DemoOrganisationResult {
  return {
    organisationId: input.organisation.id,
    usersCreated: input.users.length,
    outletsCreated: input.outlets.length
  };
}
