{{/* ConfigMap + Secret with the environment, so the Deployment only refers to them. */}}
{{- define "yt-common.config" -}}
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "yt-common.name" . }}
  labels: {{- include "yt-common.labels" . | nindent 4 }}
data:
  {{- range $k, $v := (include "yt-common.env" . | fromYaml) }}
  {{ $k }}: {{ $v | toString | quote }}
  {{- end }}
---
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "yt-common.name" . }}
  labels: {{- include "yt-common.labels" . | nindent 4 }}
type: Opaque
stringData:
  {{- range $k, $v := (include "yt-common.secretEnv" . | fromYaml) }}
  {{ $k }}: {{ $v | toString | quote }}
  {{- end }}
{{- end -}}

{{- define "yt-common.deployment" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "yt-common.name" . }}
  labels: {{- include "yt-common.labels" . | nindent 4 }}
spec:
  {{- /* With an autoscaler, the replica count belongs to it; setting it here would fight it. */}}
  {{- if not (or .Values.autoscaling.enabled (.Values.queueScaling | default dict).enabled) }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels: {{- include "yt-common.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels: {{- include "yt-common.selectorLabels" . | nindent 8 }}
      annotations:
        # A config change rolls the pods; env is read only at start.
        checksum/config: {{ include "yt-common.config" . | sha256sum }}
    spec:
      securityContext:
        runAsNonRoot: {{ .Values.securityContext.runAsNonRoot }}
        {{- with .Values.securityContext.runAsUser }}
        runAsUser: {{ . }}
        {{- end }}
      # Time to finish the work in hand (an outbox batch, a transcode) after SIGTERM.
      terminationGracePeriodSeconds: {{ .Values.terminationGracePeriodSeconds }}
      containers:
        - name: {{ include "yt-common.name" . }}
          image: {{ include "yt-common.image" . }}
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          {{- with .Values.command }}
          command: {{- toYaml . | nindent 12 }}
          {{- end }}
          ports:
            - name: http
              containerPort: {{ .Values.port }}
          envFrom:
            - configMapRef:
                name: {{ include "yt-common.name" . }}
            - secretRef:
                name: {{ include "yt-common.name" . }}
          {{- with .Values.probes }}
          startupProbe:
            httpGet: { path: {{ .path | quote }}, port: http }
            periodSeconds: 5
            failureThreshold: {{ .startupFailureThreshold }}
          readinessProbe:
            httpGet: { path: {{ .path | quote }}, port: http }
            periodSeconds: 10
          livenessProbe:
            httpGet: { path: {{ .path | quote }}, port: http }
            periodSeconds: 20
            failureThreshold: 3
          {{- end }}
          resources: {{- toYaml .Values.resources | nindent 12 }}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
{{- end -}}

{{- define "yt-common.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "yt-common.name" . }}
  labels: {{- include "yt-common.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  selector: {{- include "yt-common.selectorLabels" . | nindent 4 }}
  ports:
    - name: http
      port: {{ .Values.port }}
      targetPort: http
      {{- if and (eq .Values.service.type "NodePort") .Values.service.nodePort }}
      nodePort: {{ .Values.service.nodePort }}
      {{- end }}
{{- end -}}

{{/* CPU and memory, as a share of the requests; needs metrics-server in the cluster. */}}
{{- define "yt-common.hpa" -}}
{{- /* KEDA owns the HPA when queue scaling is on; two autoscalers on one Deployment would fight. */}}
{{- if and .Values.autoscaling.enabled (not (.Values.queueScaling | default dict).enabled) }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "yt-common.name" . }}
  labels: {{- include "yt-common.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "yt-common.name" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    {{- with .Values.autoscaling.targetCPUUtilizationPercentage }}
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: {{ . }} }
    {{- end }}
    {{- with .Values.autoscaling.targetMemoryUtilizationPercentage }}
    - type: Resource
      resource:
        name: memory
        target: { type: Utilization, averageUtilization: {{ . }} }
    {{- end }}
  behavior:
    # Scale up fast, down slowly: avoids flapping when load comes in waves.
    scaleDown:
      stabilizationWindowSeconds: 300
{{- end }}
{{- end -}}

{{/* Everything a plain service needs. */}}
{{- define "yt-common.all" -}}
{{ include "yt-common.config" . }}
---
{{ include "yt-common.deployment" . }}
---
{{ include "yt-common.service" . }}
{{- if and .Values.autoscaling.enabled (not (.Values.queueScaling | default dict).enabled) }}
---
{{ include "yt-common.hpa" . }}
{{- end }}
{{- end -}}
