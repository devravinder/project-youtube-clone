{{/* Names: the release prefix is left off, so Services keep the names the apps already use. */}}
{{- define "yt-common.name" -}}
{{- .Values.nameOverride | default .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "yt-common.labels" -}}
app.kubernetes.io/name: {{ include "yt-common.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: mini-youtube
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "yt-common.selectorLabels" -}}
app.kubernetes.io/name: {{ include "yt-common.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* registry/name:tag; the global values let one setting retarget every image. */}}
{{- define "yt-common.image" -}}
{{- $g := .Values.global | default dict -}}
{{- $registry := $g.imageRegistry | default "" -}}
{{- $tag := .Values.image.tag | default $g.imageTag | default "local" -}}
{{- if $registry -}}{{ printf "%s/%s:%s" $registry .Values.image.repository $tag }}{{- else -}}{{ printf "%s:%s" .Values.image.repository $tag }}{{- end -}}
{{- end -}}

{{/* Shared settings from the umbrella chart, then this service's own; the service wins. */}}
{{- define "yt-common.env" -}}
{{- $g := .Values.global | default dict -}}
{{- merge (deepCopy (.Values.env | default dict)) (deepCopy ($g.env | default dict)) | toYaml -}}
{{- end -}}

{{- define "yt-common.secretEnv" -}}
{{- $g := .Values.global | default dict -}}
{{- merge (deepCopy (.Values.secretEnv | default dict)) (deepCopy ($g.secretEnv | default dict)) | toYaml -}}
{{- end -}}
