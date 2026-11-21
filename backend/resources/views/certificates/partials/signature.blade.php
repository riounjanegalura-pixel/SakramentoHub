{{-- The priest's signature block. Every value is escaped; the image is a checked PNG/JPEG data URL or absent. --}}
<div class="signature">
  @if($signature['image'])
    <img class="sig-image" src="{{ $signature['image'] }}" alt="Signature of {{ $signature['name'] }}">
  @endif
  <div class="sig-line"></div>
  <p class="sig-name">{{ $signature['name'] }}</p>
  <p class="sig-title">{{ $signature['title'] }}</p>
  <p class="sig-date">Date issued: {{ $issuedOn }}</p>
</div>
