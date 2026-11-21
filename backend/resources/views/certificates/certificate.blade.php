<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $snapshot['title'] ?? 'Certificate' }} {{ $number }}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: Georgia, 'Times New Roman', serif; text-align: center; padding: 24px; color: #222; }
  .certificate { position: relative; border: 8px double #7a5c2e; padding: 40px; max-width: 720px; margin: 0 auto; overflow: hidden; }
  h1 { font-size: 28px; letter-spacing: 2px; text-transform: uppercase; color: #7a5c2e; margin: 0 0 8px; }
  .parish { font-size: 14px; color: #555; margin: 0 0 24px; }
  .name { font-size: 30px; margin: 20px 0; font-weight: bold; }
  .details { margin-top: 28px; text-align: left; }
  .details dl { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; row-gap: 10px; margin: 0; }
  .details dt { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #7a5c2e; margin: 0; }
  .details dd { font-size: 15px; margin: 2px 0 0; color: #333; }
  .meta { margin-top: 32px; font-size: 14px; color: #555; }
  .meta p { margin: 4px 0; }
  .signature { margin: 36px 0 0 auto; width: 100%; max-width: 280px; text-align: center; font-size: 14px; color: #333; }
  .signature p { margin: 2px 0; }
  .sig-image { display: block; max-width: 100%; max-height: 80px; margin: 0 auto -6px; }
  .sig-line { border-top: 1px solid #222; margin: 0 0 6px; height: 0; }
  .sig-name { font-weight: bold; }
  .signature .sig-date { margin-top: 8px; font-size: 13px; color: #555; }
  .verify { margin-top: 24px; font-size: 13px; color: #555; }
  .verify svg { width: 120px; height: 120px; }
  .code { font-family: 'Courier New', monospace; font-size: 16px; letter-spacing: 2px; color: #222; }
  .revoked { position: absolute; top: 40%; left: 0; right: 0; transform: rotate(-25deg); font-size: 96px; font-weight: bold; color: rgba(180, 0, 0, 0.28); letter-spacing: 8px; pointer-events: none; }
  .print { margin: 16px auto 0; padding: 8px 20px; font-size: 14px; cursor: pointer; }
  @media print { .print { display: none; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="certificate">
    @if($revoked)
      <div class="revoked">REVOKED</div>
    @endif
    <h1>{{ $snapshot['title'] ?? 'Certificate' }}</h1>
    <p class="parish">{{ $snapshot['parishName'] ?? '' }}@if(! empty($snapshot['parishAddress'])) · {{ $snapshot['parishAddress'] }}@endif</p>
    <p>This is to certify that</p>
    <p class="name">{{ $snapshot['subjectName'] ?? '' }}</p>
    <p>{{ $snapshot['statement'] ?? '' }}</p>

    @if(! empty($snapshot['details']))
      <div class="details">
        <dl>
          @foreach($snapshot['details'] as $row)
            <dt>{{ $row['label'] ?? '' }}</dt>
            <dd>{{ $row['value'] ?? '' }}</dd>
          @endforeach
        </dl>
      </div>
    @endif

    <div class="meta">
      <p>Register No. {{ $number }}</p>
      @if($paperReference)
        <p>{{ $paperReference }}</p>
      @endif
      @if($purpose)
        <p>Issued for: {{ $purpose }}</p>
      @endif
    </div>

    @include('certificates.partials.signature')

    @if($qr)
      <div class="verify">
        {!! $qr !!}
        <p>Verify at {{ $verifyHost }}</p>
        <p class="code">{{ $code }}</p>
      </div>
    @endif
  </div>
  <button class="print" onclick="window.print()">Print</button>
</body>
</html>
