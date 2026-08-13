export interface JsonApiLinks {
  self?: string;
  next?: string;
  prev?: string;
  related?: string;
}

export interface JsonApiPagingMeta {
  paging?: {
    total?: number;
    limit?: number;
    nextCursor?: string;
  };
}

export interface JsonApiRelationship {
  data?:
    | {
        id: string;
        type: string;
      }
    | Array<{
        id: string;
        type: string;
      }>;
  links?: JsonApiLinks;
}

export interface JsonApiResource<TAttributes = Record<string, unknown>> {
  id: string;
  type: string;
  attributes?: TAttributes;
  relationships?: Record<string, JsonApiRelationship>;
  links?: JsonApiLinks;
}

export interface JsonApiDocument<TResource> {
  data: TResource;
  included?: Array<JsonApiResource>;
  links?: JsonApiLinks;
  meta?: JsonApiPagingMeta;
}

export interface JsonApiListDocument<TResource> {
  data: TResource[];
  included?: Array<JsonApiResource>;
  links?: JsonApiLinks;
  meta?: JsonApiPagingMeta;
}

export interface AppleErrorDocument {
  errors?: Array<{
    id?: string;
    status?: string;
    code?: string;
    title?: string;
    detail?: string;
    source?: {
      pointer?: string;
      parameter?: string;
    };
  }>;
}

export interface AppAttributes {
  name?: string;
  bundleId?: string;
  sku?: string;
  primaryLocale?: string;
}

export interface AppInfoAttributes {
  appStoreState?: string;
  state?: string;
}

export interface AppInfoLocalizationAttributes {
  locale?: string;
  name?: string;
  subtitle?: string;
  privacyPolicyUrl?: string;
  privacyChoicesUrl?: string;
  privacyPolicyText?: string;
}

export interface AppStoreVersionAttributes {
  versionString?: string;
  appStoreState?: string;
  copyright?: string;
  createdDate?: string;
  downloadable?: boolean;
  earliestReleaseDate?: string;
  platform?: string;
  releaseType?: string;
}

export interface AppStoreVersionLocalizationAttributes {
  locale?: string;
  description?: string;
  keywords?: string;
  promotionalText?: string;
  marketingUrl?: string;
  supportUrl?: string;
  whatsNew?: string;
}

export interface AnalyticsReportRequestAttributes {
  accessType?: string;
  stoppedDueToInactivity?: boolean;
}

export interface AnalyticsReportAttributes {
  name?: string;
  category?: string;
}

export interface AnalyticsReportInstanceAttributes {
  granularity?: string;
  processingDate?: string;
}

export interface AnalyticsReportSegmentAttributes {
  checksum?: string;
  sizeInBytes?: number;
  url?: string;
}

export interface AnalyticsReportRequestRelationships {
  reports?: JsonApiRelationship;
}

export interface AppStoreConnectApiErrorDetails {
  status: number;
  message: string;
  errors: AppleErrorDocument["errors"];
  rawBody?: string;
}

export class AppStoreConnectApiError extends Error {
  readonly status: number;
  readonly errors: AppleErrorDocument["errors"];
  readonly rawBody?: string;

  constructor(details: AppStoreConnectApiErrorDetails) {
    super(details.message);
    this.name = "AppStoreConnectApiError";
    this.status = details.status;
    this.errors = details.errors;
    this.rawBody = details.rawBody;
  }
}
