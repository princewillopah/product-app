{{/*
Common labels applied to every rendered object.
Usage: {{ include "product-app.labels" (dict "ctx" $ "name" $name) }}
*/}}
{{- define "product-app.labels" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/part-of: product-app
app.kubernetes.io/managed-by: {{ .ctx.Release.Service }}
helm.sh/chart: {{ .ctx.Chart.Name }}-{{ .ctx.Chart.Version | replace "+" "_" }}
{{- end -}}

{{/*
Selector labels — stable across upgrades, used by Deployments/Services.
*/}}
{{- define "product-app.selectorLabels" -}}
app: {{ .name }}
{{- end -}}

{{/*
Fully-qualified image reference for a service.
Usage: {{ include "product-app.image" (dict "ctx" $ "svc" $svc) }}
*/}}
{{- define "product-app.image" -}}
{{- $img := .ctx.Values.global.image -}}
{{- printf "%s/%s/%s:%s" $img.registry $img.repository .svc.image (.svc.tag | default $img.tag) -}}
{{- end -}}
