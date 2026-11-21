{!! $parishName !!}

Hello {!! $greetingName !!},

@foreach ($lines as $line)
{!! $line !!}

@endforeach
@if ($actionUrl && $actionLabel)
{!! $actionLabel !!}: {!! $actionUrl !!}

@endif
You are receiving this because of a request you made with {!! $parishName !!}. Please do not reply to this email.
