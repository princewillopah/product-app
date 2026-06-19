{{/*
Common labels for objects created by THIS chart (not the subcharts).
*/}}
{{- define "observability.labels" -}}
app.kubernetes.io/part-of: product-app
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}
